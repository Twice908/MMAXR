import { validateUsername, type AttemptLimiter } from "../auth/access.js";
import { el } from "./dom.js";

/** What the login page needs from the app. */
export interface LoginDeps {
  /** True when the code is on the access list. Sync or async. */
  readonly verifyCode: (code: string) => boolean | Promise<boolean>;
  readonly limiter: AttemptLimiter;
  /** Called with the cleaned name once the code is accepted. */
  readonly onSignedIn: (username: string) => void;
}

/** Show the login form. Returns the teardown. */
export function mountLogin(root: HTMLElement, deps: LoginDeps): () => void {
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
  const submit = el("button", { type: "submit", class: "primary-button" }, "Sign in");
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

  root.replaceChildren(
    el(
      "main",
      { class: "login-page" },
      el(
        "section",
        { class: "login-card", "aria-labelledby": "login-title" },
        el("span", { class: "shell-mark", "aria-hidden": "true" }, "M"),
        el("p", { class: "shell-eyebrow" }, "MATH MAAM ACADEMY"),
        el("h1", { id: "login-title" }, "Science experiments"),
        el("p", { class: "lede" }, "Type your name and the access code from your teacher."),
        form,
        el("p", { class: "fine-print" }, "No account needed. Your name stays on this device."),
      ),
    ),
  );

  const showError = (message: string, field?: HTMLInputElement): void => {
    error.textContent = message;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
  };
  const clearError = (): void => {
    error.textContent = "";
    username.removeAttribute("aria-invalid");
    code.removeAttribute("aria-invalid");
  };

  let busy = false;
  let disposed = false;
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
    try {
      const accepted = await deps.verifyCode(code.value);
      if (disposed) return;
      if (accepted) {
        deps.limiter.reset();
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
  };
  const onSubmitListener = (event: SubmitEvent): void => void onSubmit(event);
  form.addEventListener("submit", onSubmitListener);
  toggle.addEventListener("click", onToggle);
  username.focus();

  return () => {
    disposed = true;
    form.removeEventListener("submit", onSubmitListener);
    toggle.removeEventListener("click", onToggle);
    root.replaceChildren();
  };
}
