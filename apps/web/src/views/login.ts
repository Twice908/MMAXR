import { createSoundToggle, departOut, ease, revealIn, shake } from "@mma/engine-ambience";
import { validateUsername, type AttemptLimiter } from "../auth/access.js";
import type { Route } from "../router.js";
import type { Stage } from "../stage/stage.js";
import { DASHBOARD_PALETTE, DENY_PALETTE, LOGIN_HORIZON, LOGIN_MOOD, LOGIN_PALETTE, LOGIN_SUN } from "../stage/theme.js";
import { transitionFor } from "../stage/transitions.js";
import { el } from "./dom.js";
import type { Screen } from "./screen.js";

/** What the login page needs from the app. */
export interface LoginDeps {
  /** True when the code is on the access list. Sync or async. */
  readonly verifyCode: (code: string) => boolean | Promise<boolean>;
  readonly limiter: AttemptLimiter;
  /** Called with the cleaned name once the code is accepted. */
  readonly onSignedIn: (username: string) => void;
  readonly stage: Stage;
  /** The page shown before this one, or null on first load. */
  readonly from: Route | null;
}

/** Show the login page: a card in orbit above a backlit planet. */
export function mountLogin(root: HTMLElement, deps: LoginDeps): Screen {
  const { stage } = deps;
  const { cosmos, sound, veil } = stage;

  const username = el("input", {
    id: "login-username",
    name: "username",
    type: "text",
    autocomplete: "off",
    autocapitalize: "words",
    spellcheck: "false",
    maxlength: "40",
    required: true,
    "aria-describedby": "login-error",
  });
  const code = el("input", {
    id: "login-code",
    name: "access-code",
    type: "password",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    required: true,
    "aria-describedby": "login-error",
  });
  const toggle = el("button", { type: "button", class: "ghost-button", "aria-pressed": "false" }, "Show");
  const error = el("p", { id: "login-error", class: "form-error", role: "alert" });
  const submit = el("button", { type: "submit", class: "primary-button" }, el("span", {}, "Sign in"));
  const form = el(
    "form",
    { class: "login-form", novalidate: true },
    el("label", { for: "login-username" }, "Your name"),
    username,
    el("label", { for: "login-code" }, "Access code"),
    el("div", { class: "code-row" }, code, toggle),
    error,
    submit,
  );
  const soundToggle = createSoundToggle(sound);
  const sunAnchor = el("div", { class: "login-sun", "aria-hidden": "true" });
  const horizonAnchor = el("div", { class: "login-horizon", "aria-hidden": "true" });
  const header = el(
    "div",
    { class: "login-head" },
    el("span", { class: "shell-mark", "aria-hidden": "true" }, "M"),
    el("p", { class: "shell-eyebrow" }, "MATH MAAM ACADEMY"),
  );
  const title = el("h1", { id: "login-title" }, "Science experiments");
  const lede = el("p", { class: "lede" }, "Type your name and the access code from your teacher.");
  const finePrint = el("p", { class: "fine-print" }, "No account needed. Your name stays on this device.");
  const card = el("section", { class: "login-card", "aria-labelledby": "login-title" }, header, title, lede, form, finePrint);
  const page = el(
    "main",
    { class: "login-page" },
    horizonAnchor,
    sunAnchor,
    el("div", { class: "screen-corner" }, soundToggle.element),
    card,
  );
  root.replaceChildren(page);

  // The sky: a distant sun backlighting a giant planet rising from the bottom of the screen.
  const sun = cosmos.addStar(LOGIN_SUN);
  sun.anchorTo(sunAnchor);
  const horizon = cosmos.addPlanet({ ...LOGIN_HORIZON, lightFrom: sun });
  horizon.anchorTo(horizonAnchor);

  const entry = transitionFor(deps.from, { name: "login" });
  cosmos.setPalette(LOGIN_PALETTE, entry.kind === "open" ? 0 : stage.time(1600));
  sound.setMood(LOGIN_MOOD, 2.6);
  sound.setBedLevel(1, 2);
  if (entry.kind === "depart") {
    void cosmos.warpTo(0, stage.time(1300), ease.outCubic);
    sound.arrive();
  }
  if (veil.showing) void veil.hide(stage.time(entry.kind === "open" ? 1500 : 500));
  void revealIn([header, title, lede, form, finePrint], {
    delayMs: entry.kind === "open" ? 420 : 260,
    reducedMotion: stage.reducedMotion,
  });
  void revealIn([soundToggle.element], { delayMs: 900, reducedMotion: stage.reducedMotion });

  const showError = (message: string, field?: HTMLInputElement): void => {
    error.textContent = message;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
    sound.cue("deny");
    shake(card, stage.reducedMotion);
    cosmos.setPalette(DENY_PALETTE, stage.time(220));
    window.clearTimeout(denyTimer);
    denyTimer = window.setTimeout(() => cosmos.setPalette(LOGIN_PALETTE, stage.time(1600)), 520);
  };
  const clearError = (): void => {
    error.textContent = "";
    username.removeAttribute("aria-invalid");
    code.removeAttribute("aria-invalid");
  };

  let busy = false;
  let disposed = false;
  let denyTimer = 0;
  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    clearError();
    const name = validateUsername(username.value);
    if (!name.ok) {
      showError(name.message, username);
      return;
    }
    const attempt = deps.limiter.check();
    if (!attempt.allowed) {
      showError(`Too many tries. Wait ${Math.ceil(attempt.retryAfterMs / 1000)} seconds, then try again.`);
      return;
    }
    busy = true;
    submit.disabled = true;
    sound.cue("tick");
    try {
      const accepted = await deps.verifyCode(code.value);
      if (disposed) return;
      if (accepted) {
        deps.limiter.reset();
        sound.cue("confirm");
        sun.setHighlight(true);
        horizon.setHighlight(true);
        deps.onSignedIn(name.value);
        return;
      }
      deps.limiter.recordFailure();
      code.value = "";
      showError("That access code is not right. Check it with your teacher and try again.", code);
    } catch (reason) {
      if (disposed) return;
      console.warn("Login check failed.", reason);
      showError(reason instanceof Error ? reason.message : "Login could not run. Try again.");
    } finally {
      busy = false;
      submit.disabled = false;
    }
  };
  const onToggle = (): void => {
    const show = code.type === "password";
    code.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(show));
    sound.cue("tick");
  };
  const onFieldFocus = (): void => sound.cue("tick");
  const onSubmitListener = (event: SubmitEvent): void => void onSubmit(event);
  form.addEventListener("submit", onSubmitListener);
  toggle.addEventListener("click", onToggle);
  username.addEventListener("focus", onFieldFocus);
  code.addEventListener("focus", onFieldFocus);
  username.focus();

  return {
    async leave(to) {
      const exit = transitionFor({ name: "login" }, to);
      if (exit.kind === "launch" && !stage.reducedMotion) {
        // Light speed: the card rushes past, the planet drops away and the stars stretch.
        sound.sweep("warp", 1.05);
        cosmos.setPalette(DASHBOARD_PALETTE, 1400);
        horizonAnchor.animate([{ transform: "translate(-50%, 0)" }, { transform: "translate(-50%, 55vh)" }], {
          duration: 1100,
          easing: "cubic-bezier(0.55, 0, 0.75, 0.2)",
          fill: "forwards",
        });
        sunAnchor.animate([{ transform: "translate(0, 0)" }, { transform: "translate(18vw, -14vh) scale(0.6)" }], {
          duration: 1100,
          easing: "cubic-bezier(0.55, 0, 0.75, 0.2)",
          fill: "forwards",
        });
        await Promise.all([
          cosmos.warpTo(1, 1050, ease.inCubic),
          departOut(card, { scale: 1.12, lift: 0, durationMs: 700 }),
          departOut(soundToggle.element, { durationMs: 400 }),
        ]);
        return;
      }
      if (exit.kind === "launch") cosmos.setPalette(DASHBOARD_PALETTE, stage.time(600));
      await departOut(card, { reducedMotion: stage.reducedMotion });
    },
    dispose() {
      disposed = true;
      window.clearTimeout(denyTimer);
      form.removeEventListener("submit", onSubmitListener);
      toggle.removeEventListener("click", onToggle);
      username.removeEventListener("focus", onFieldFocus);
      code.removeEventListener("focus", onFieldFocus);
      soundToggle.dispose();
      sun.remove();
      horizon.remove();
      root.replaceChildren();
    },
  };
}
