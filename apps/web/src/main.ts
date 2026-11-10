import "./shell.css";
import "./views/views.css";
import { ACCESS_CODES } from "./auth/access-codes.js";
import { createAttemptLimiter, verifyAccessCode } from "./auth/access.js";
import { createSessionStore } from "./auth/session.js";
import { findExperiment } from "./catalogue.js";
import { experiments } from "./experiments.js";
import { parseRoute, resolveRoute, routeHash, type Route } from "./router.js";
import { createStage, type Stage } from "./stage/stage.js";
import { planetLook } from "./stage/theme.js";
import { sameRoute } from "./stage/transitions.js";
import { mountDashboard } from "./views/dashboard.js";
import { mountLogin } from "./views/login.js";
import type { Screen } from "./views/screen.js";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("App root element is missing");
}
const app: HTMLElement = appRoot;
app.className = "app-shell";

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("narration-generator")) {
  // Developer tool for generating narration audio. It sits outside the student login.
  app.innerHTML = '<div class="shell-loading" role="status">Loading narration generator...</div>';
  void import("./narration-generator.js")
    .then(({ mountNarrationGenerator }) => mountNarrationGenerator(app))
    .catch((error: unknown) => showLoadError(error));
} else {
  startApp();
}

function startApp(): void {
  const stage = createStage(document);
  const sessions = createSessionStore({
    storage: window.localStorage,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
  const limiter = createAttemptLimiter({ maxAttempts: 5, lockMs: 30_000, now: () => Date.now() });
  const experimentIds = experiments.map((experiment) => experiment.id);
  let current: { readonly route: Route; readonly screen: Screen } | null = null;
  // Page changes run one at a time, so an exit animation always finishes before the next page mounts.
  let queue: Promise<void> = Promise.resolve();

  const navigate = (route: Route): void => {
    window.location.hash = routeHash(route);
  };

  const render = async (): Promise<void> => {
    const requested = parseRoute(window.location.hash);
    const route = resolveRoute(requested, sessions.get(), experimentIds);
    const wanted = routeHash(route);
    if (window.location.hash !== wanted) {
      // Replace so the back button never lands on a page the student may not see.
      window.history.replaceState(null, "", wanted);
    }
    if (current && sameRoute(current.route, route)) return;

    const from = current?.route ?? null;
    if (current) {
      app.inert = true;
      try {
        await current.screen.leave(route);
      } catch (error) {
        console.warn("Page exit animation failed.", error);
      }
      current.screen.dispose();
      app.replaceChildren();
      app.inert = false;
    }
    current = { route, screen: await mountRoute(route, from) };
  };

  const mountRoute = async (route: Route, from: Route | null): Promise<Screen> => {
    const session = sessions.get();
    if (route.name === "login" || !session) {
      document.title = "Sign in | Math Maam Academy";
      stage.setCosmic(true);
      return mountLogin(app, {
        verifyCode: (code) => verifyAccessCode(code, ACCESS_CODES),
        limiter,
        stage,
        from,
        onSignedIn: (username) => {
          sessions.signIn(username);
          navigate({ name: "dashboard" });
        },
      });
    }

    if (route.name === "dashboard") {
      document.title = "Experiments | Math Maam Academy";
      stage.setCosmic(true);
      return mountDashboard(app, {
        session,
        experiments,
        stage,
        from,
        rename: (username) => sessions.rename(username),
        onSignOut: () => {
          sessions.signOut();
          navigate({ name: "login" });
        },
      });
    }

    return mountExperiment(route.id, stage);
  };

  const mountExperiment = async (id: string, stage: Stage): Promise<Screen> => {
    const experiment = findExperiment(experiments, id);
    const palette = planetLook(id).palette;
    const closed: Screen = { leave: () => Promise.resolve(), dispose: () => undefined };
    if (!experiment) {
      navigate({ name: "dashboard" });
      return closed;
    }
    document.title = `${experiment.title} | Math Maam Academy`;
    // The veil (already up after the dive, or raised now) covers the load in the planet's colours.
    stage.veil.setLabel(`Opening ${experiment.title}`);
    if (!stage.veil.showing) await stage.veil.show(palette, stage.time(300));
    stage.sound.setBedLevel(0, 1.5);
    try {
      const mount = await experiment.load();
      stage.setCosmic(false);
      const teardown = mount(app, { onExit: () => navigate({ name: "dashboard" }) });
      stage.veil.setLabel("");
      void stage.veil.hide(stage.time(650));
      return {
        async leave() {
          stage.veil.setLabel("");
          await stage.veil.show(palette, stage.time(380));
        },
        dispose: teardown,
      };
    } catch (error) {
      stage.setCosmic(true);
      stage.veil.setLabel("");
      void stage.veil.hide(stage.time(400));
      showLoadError(error, experiment.title);
      return closed;
    }
  };

  const schedule = (): void => {
    queue = queue.then(render).catch((error: unknown) => {
      console.error("Navigation failed.", error);
    });
  };
  window.addEventListener("hashchange", schedule);
  schedule();
}

function showLoadError(error: unknown, title = "This page"): void {
  app.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "shell-error";
  wrapper.setAttribute("role", "alert");
  const message = document.createElement("p");
  message.textContent = error instanceof Error ? error.message : `${title} could not be loaded.`;
  const back = document.createElement("a");
  back.href = "#/dashboard";
  back.textContent = "Back to experiments";
  wrapper.append(message, back);
  app.append(wrapper);
}
