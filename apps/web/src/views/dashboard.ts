import { validateUsername } from "../auth/access.js";
import type { Session } from "../auth/session.js";
import { groupBySubject, type Experiment, type SubjectSection } from "../catalogue.js";
import { routeHash } from "../router.js";
import { el, initialOf } from "./dom.js";

/** What the dashboard needs from the app. */
export interface DashboardDeps {
  readonly session: Session;
  readonly experiments: readonly Experiment[];
  /** Change the display name. Returns the updated session, or null if signed out meanwhile. */
  readonly rename: (username: string) => Session | null;
  readonly onSignOut: () => void;
}

/** Show the student dashboard: top bar, settings and experiments by subject. Returns the teardown. */
export function mountDashboard(root: HTMLElement, deps: DashboardDeps): () => void {
  let session = deps.session;
  const sections = groupBySubject(deps.experiments);

  const avatar = el("span", { class: "avatar", "aria-hidden": "true" });
  const nameLabel = el("span", { class: "user-name" });
  const greeting = el("h1", { id: "dashboard-title" });
  const menuToggle = el(
    "button",
    {
      type: "button",
      class: "menu-toggle",
      "aria-label": "Menu",
      "aria-expanded": "false",
      "aria-controls": "topbar-menu",
    },
    el("span", { class: "menu-bar" }),
    el("span", { class: "menu-bar" }),
    el("span", { class: "menu-bar" }),
  );
  const settingsButton = el("button", { type: "button", class: "ghost-button", "data-action": "settings" }, "Settings");
  const signOutButton = el("button", { type: "button", class: "ghost-button", "data-action": "sign-out" }, "Sign out");

  const renderIdentity = (): void => {
    avatar.textContent = initialOf(session.username);
    nameLabel.textContent = session.username;
    greeting.textContent = `Hi, ${session.username}`;
  };

  const settings = buildSettingsDialog(() => session, (name) => {
    const updated = deps.rename(name);
    if (!updated) return false;
    session = updated;
    renderIdentity();
    return true;
  }, deps.onSignOut);

  const topbar = el(
    "header",
    { class: "topbar" },
    el(
      "div",
      { class: "brand" },
      el("span", { class: "shell-mark", "aria-hidden": "true" }, "M"),
      el("span", {}, "Math Maam Academy"),
    ),
    menuToggle,
    el(
      "div",
      { id: "topbar-menu", class: "topbar-actions" },
      el("span", { class: "user-chip" }, avatar, nameLabel),
      settingsButton,
      signOutButton,
    ),
  );

  root.replaceChildren(
    el(
      "div",
      { class: "dashboard" },
      topbar,
      el(
        "main",
        { class: "dashboard-main", "aria-labelledby": "dashboard-title" },
        el(
          "section",
          { class: "welcome" },
          el("p", { class: "shell-eyebrow" }, "YOUR EXPERIMENTS"),
          greeting,
          el("p", { class: "lede" }, "Pick an experiment to start. You can come back here at any time."),
        ),
        ...sections.map(renderSection),
      ),
      settings.dialog,
    ),
  );
  renderIdentity();

  // On phones the options sit in a dropdown opened by the menu button (see views.css).
  const setMenuOpen = (open: boolean): void => {
    topbar.classList.toggle("is-menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  };
  const onMenuToggle = (): void => setMenuOpen(!topbar.classList.contains("is-menu-open"));
  const onDocumentClick = (event: MouseEvent): void => {
    if (topbar.classList.contains("is-menu-open") && !topbar.contains(event.target as Node)) setMenuOpen(false);
  };
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && topbar.classList.contains("is-menu-open")) {
      setMenuOpen(false);
      menuToggle.focus();
    }
  };
  const onSettings = (): void => {
    setMenuOpen(false);
    settings.open();
  };
  const onSignOut = (): void => {
    setMenuOpen(false);
    deps.onSignOut();
  };
  menuToggle.addEventListener("click", onMenuToggle);
  settingsButton.addEventListener("click", onSettings);
  signOutButton.addEventListener("click", onSignOut);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);

  return () => {
    menuToggle.removeEventListener("click", onMenuToggle);
    settingsButton.removeEventListener("click", onSettings);
    signOutButton.removeEventListener("click", onSignOut);
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
    settings.dispose();
    root.replaceChildren();
  };
}

function renderSection({ subject, experiments }: SubjectSection): HTMLElement {
  const headingId = `subject-${subject.id}`;
  const body =
    experiments.length === 0
      ? [
          el(
            "li",
            { class: "experiment-card is-empty", "data-subject": subject.id },
            el("h3", {}, "Coming soon"),
            el("p", {}, `${subject.label} experiments are on the way.`),
          ),
        ]
      : experiments.map((experiment) => renderExperiment(experiment));
  return el(
    "section",
    { class: "subject-section", "aria-labelledby": headingId, "data-subject": subject.id },
    el("h2", { id: headingId }, subject.label),
    el("ul", { class: "experiment-list" }, ...body),
  );
}

function renderExperiment(experiment: Experiment): HTMLElement {
  return el(
    "li",
    { class: "experiment-card", "data-experiment": experiment.id },
    el(
      "div",
      { class: "card-meta" },
      el("span", { class: "badge" }, `${experiment.estimatedMinutes} min`),
      experiment.releaseStatus === "draft" && el("span", { class: "badge status-draft" }, "Draft"),
    ),
    el("h3", {}, experiment.title),
    el(
      "a",
      {
        class: "primary-button",
        href: routeHash({ name: "experiment", id: experiment.id }),
        "aria-label": `Open ${experiment.title}`,
      },
      "Open",
    ),
  );
}

interface SettingsDialog {
  readonly dialog: HTMLDialogElement;
  open(): void;
  dispose(): void;
}

function buildSettingsDialog(
  getSession: () => Session,
  rename: (name: string) => boolean,
  onSignOut: () => void,
): SettingsDialog {
  const name = el("input", {
    id: "settings-name",
    type: "text",
    autocomplete: "off",
    maxlength: "40",
    "aria-describedby": "settings-status",
  });
  const status = el("p", { id: "settings-status", class: "form-error", role: "status" });
  const save = el("button", { type: "submit", class: "primary-button" }, "Save name");
  const close = el("button", { type: "button", class: "ghost-button", "data-action": "close-settings" }, "Close");
  const signOut = el("button", { type: "button", class: "danger-button" }, "Sign out");
  const form = el(
    "form",
    { class: "settings-form", novalidate: true },
    el("label", { for: "settings-name" }, "Display name"),
    name,
    status,
    save,
  );
  const dialog = el(
    "dialog",
    { class: "settings-dialog", "aria-labelledby": "settings-title" },
    el("header", {}, el("h2", { id: "settings-title" }, "Settings"), close),
    form,
    el(
      "section",
      { class: "settings-info" },
      el("h3", {}, "Sound and captions"),
      el("p", {}, "Choose these inside each experiment. They are remembered on this device."),
      el("h3", {}, "Motion"),
      el("p", {}, "Animations follow your device's reduce-motion setting."),
    ),
    el("footer", {}, signOut),
  );

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    status.classList.remove("is-ok");
    const result = validateUsername(name.value);
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    if (rename(result.value)) {
      name.value = result.value;
      status.textContent = "Saved.";
      status.classList.add("is-ok");
    }
  };
  const onClose = (): void => dialog.close();
  const onBackdrop = (event: MouseEvent): void => {
    if (event.target === dialog) dialog.close();
  };
  form.addEventListener("submit", onSubmit);
  close.addEventListener("click", onClose);
  signOut.addEventListener("click", onSignOut);
  dialog.addEventListener("click", onBackdrop);

  return {
    dialog,
    open() {
      name.value = getSession().username;
      status.textContent = "";
      status.classList.remove("is-ok");
      dialog.showModal();
    },
    dispose() {
      form.removeEventListener("submit", onSubmit);
      close.removeEventListener("click", onClose);
      signOut.removeEventListener("click", onSignOut);
      dialog.removeEventListener("click", onBackdrop);
      if (dialog.open) dialog.close();
    },
  };
}
