import "./shell.css";
import "./views/views.css";
import accessCodes from "./auth/access-codes.json";
import { createAttemptLimiter, verifyAccessCode } from "./auth/access.js";
import { createSessionStore } from "./auth/session.js";
import { findExperiment } from "./catalogue.js";
import { experiments } from "./experiments.js";
import { parseRoute, resolveRoute, routeHash, type Route } from "./router.js";
import { mountDashboard } from "./views/dashboard.js";
import { mountLogin } from "./views/login.js";

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
    .catch(showLoadError);
} else {
  startApp();
}

function startApp(): void {
  const sessions = createSessionStore({
    storage: window.localStorage,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
  const limiter = createAttemptLimiter({ maxAttempts: 5, lockMs: 30_000, now: () => Date.now() });
  const experimentIds = experiments.map((experiment) => experiment.id);
  let teardown: () => void = () => undefined;
  // Bumped on every navigation so a slow experiment load cannot mount after the student left.
  let navigation = 0;

  const navigate = (route: Route): void => {
    window.location.hash = routeHash(route);
  };

  const render = (): void => {
    navigation += 1;
    const current = navigation;
    teardown();
    teardown = () => undefined;

    const requested = parseRoute(window.location.hash);
    const route = resolveRoute(requested, sessions.get(), experimentIds);
    const wanted = routeHash(route);
    if (window.location.hash !== wanted) {
      // Replace so the back button never lands on a page the student may not see.
      window.history.replaceState(null, "", wanted);
    }

    const session = sessions.get();
    if (route.name === "login" || !session) {
      document.title = "Sign in | Math Maam Academy";
      teardown = mountLogin(app, {
        verifyCode: (code) =>
          verifyAccessCode(code, accessCodes, { allowDevCodes: import.meta.env.DEV }),
        limiter,
        onSignedIn: (username) => {
          sessions.signIn(username);
          navigate({ name: "dashboard" });
        },
      });
      return;
    }

    if (route.name === "dashboard") {
      document.title = "Experiments | Math Maam Academy";
      teardown = mountDashboard(app, {
        session,
        experiments,
        rename: (username) => sessions.rename(username),
        onSignOut: () => {
          sessions.signOut();
          navigate({ name: "login" });
        },
      });
      return;
    }

    const experiment = findExperiment(experiments, route.id);
    if (!experiment) {
      navigate({ name: "dashboard" });
      return;
    }
    document.title = `${experiment.title} | Math Maam Academy`;
    app.innerHTML = `<div class="shell-loading" role="status">Loading ${escapeText(experiment.title)}...</div>`;
    void experiment
      .load()
      .then((mount) => {
        if (current !== navigation) return;
        teardown = mount(app, { onExit: () => navigate({ name: "dashboard" }) });
      })
      .catch((error: unknown) => {
        if (current === navigation) showLoadError(error, experiment.title);
      });
  };

  window.addEventListener("hashchange", render);
  render();
}

function escapeText(value: string): string {
  const holder = document.createElement("span");
  holder.textContent = value;
  return holder.innerHTML;
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
