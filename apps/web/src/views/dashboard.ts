import {
  createSoundToggle,
  departOut,
  ease,
  revealIn,
  type CelestialBody,
  type Orbit,
  type SoundToggle,
} from "@mma/engine-ambience";
import { validateUsername } from "../auth/access.js";
import type { Session } from "../auth/session.js";
import { groupBySubject, type Experiment, type SubjectSection } from "../catalogue.js";
import { routeHash, type Route } from "../router.js";
import type { Stage } from "../stage/stage.js";
import { DASHBOARD_MOOD, DASHBOARD_PALETTE, LOGIN_PALETTE, planetLook, systemLook, type PlanetLook } from "../stage/theme.js";
import { transitionFor } from "../stage/transitions.js";
import { el, initialOf } from "./dom.js";
import type { Screen } from "./screen.js";

/** What the dashboard needs from the app. */
export interface DashboardDeps {
  readonly session: Session;
  readonly experiments: readonly Experiment[];
  /** Change the display name. Returns the updated session, or null if signed out meanwhile. */
  readonly rename: (username: string) => Session | null;
  readonly onSignOut: () => void;
  readonly stage: Stage;
  /** The page shown before this one, or null on first load. */
  readonly from: Route | null;
}

interface PlanetEntry {
  readonly experiment: Experiment;
  readonly look: PlanetLook;
  readonly body: CelestialBody;
  readonly star: CelestialBody;
  readonly link: HTMLAnchorElement;
  readonly mood: ReturnType<typeof systemLook>["mood"];
}

/**
 * Show the student dashboard as a small universe: each subject is a star system and each
 * experiment a planet in orbit. Pointing at a planet recolours the sky and retunes the music.
 */
export function mountDashboard(root: HTMLElement, deps: DashboardDeps): Screen {
  const { stage } = deps;
  const { cosmos, sound, veil } = stage;
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
  const soundToggle = createSoundToggle(sound);
  const settingsButton = el("button", { type: "button", class: "ghost-button", "data-action": "settings" }, "Settings");
  const signOutButton = el("button", { type: "button", class: "ghost-button", "data-action": "sign-out" }, "Sign out");

  const renderIdentity = (): void => {
    avatar.textContent = initialOf(session.username);
    nameLabel.textContent = session.username;
    greeting.textContent = `Hi, ${session.username}`;
  };

  const settings = buildSettingsDialog(
    stage,
    () => session,
    (name) => {
      const updated = deps.rename(name);
      if (!updated) return false;
      session = updated;
      renderIdentity();
      return true;
    },
    deps.onSignOut,
    () => soundToggle.sync(),
  );

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
      soundToggle.element,
      settingsButton,
      signOutButton,
    ),
  );

  const welcome = el(
    "section",
    { class: "welcome" },
    el("p", { class: "shell-eyebrow" }, "YOUR UNIVERSE"),
    greeting,
    el("p", { class: "lede" }, "Choose a planet to start an experiment. You can come back here at any time."),
  );

  const planets = new Map<string, PlanetEntry>();
  const stars: CelestialBody[] = [];
  const orbits: Orbit[] = [];
  const systems = sections.map((section) => renderSystem(section));
  const main = el(
    "main",
    { class: "dashboard-main", "aria-labelledby": "dashboard-title" },
    welcome,
    el("div", { class: "galaxy" }, ...systems.map((system) => system.element)),
  );

  root.replaceChildren(el("div", { class: "dashboard" }, topbar, main, settings.dialog));
  renderIdentity();

  // Build the sky behind the DOM: stars first, so planets can take their light from them.
  for (const system of systems) system.build();

  // Navigation is carried by colour and sound: the focused planet tints the nebula and
  // the pad glides to its subject's chord; leaving it glides back.
  let focusedId: string | null = null;
  let unfocusTimer = 0;
  const focusPlanet = (id: string): void => {
    window.clearTimeout(unfocusTimer);
    if (focusedId === id) return;
    if (focusedId) planets.get(focusedId)?.body.setHighlight(false);
    focusedId = id;
    const entry = planets.get(id);
    if (!entry) return;
    entry.body.setHighlight(true);
    cosmos.focus(entry.body);
    cosmos.setPalette(entry.look.palette, stage.time(900));
    sound.setMood(entry.mood, 1.6);
    const rect = entry.link.getBoundingClientRect();
    const pan = ((rect.left + rect.width / 2) / Math.max(1, window.innerWidth)) * 1.4 - 0.7;
    sound.cue("hover", { midi: entry.look.note, pan });
  };
  const unfocusPlanet = (): void => {
    window.clearTimeout(unfocusTimer);
    unfocusTimer = window.setTimeout(() => {
      if (!focusedId) return;
      planets.get(focusedId)?.body.setHighlight(false);
      focusedId = null;
      cosmos.focus(null);
      cosmos.setPalette(DASHBOARD_PALETTE, stage.time(1300));
      sound.setMood(DASHBOARD_MOOD, 2.4);
    }, 160);
  };
  const planetListeners: (() => void)[] = [];
  for (const [id, entry] of planets) {
    const enter = (): void => focusPlanet(id);
    const pointerEnter = (event: PointerEvent): void => {
      if (event.pointerType !== "touch") enter();
    };
    entry.link.addEventListener("pointerenter", pointerEnter);
    entry.link.addEventListener("pointerleave", unfocusPlanet);
    entry.link.addEventListener("focus", enter);
    entry.link.addEventListener("blur", unfocusPlanet);
    planetListeners.push(() => {
      entry.link.removeEventListener("pointerenter", pointerEnter);
      entry.link.removeEventListener("pointerleave", unfocusPlanet);
      entry.link.removeEventListener("focus", enter);
      entry.link.removeEventListener("blur", unfocusPlanet);
    });
  }

  // Arrival.
  const entry = transitionFor(deps.from, { name: "dashboard" });
  const revealTargets = [topbar, welcome, ...systems.map((system) => system.element)];
  sound.setMood(DASHBOARD_MOOD, 2.4);
  switch (entry.kind) {
    case "launch":
      cosmos.setPalette(DASHBOARD_PALETTE, stage.time(1200));
      void cosmos.warpTo(0, stage.time(1700), ease.outCubic);
      sound.arrive();
      void revealIn(revealTargets, { delayMs: 420, staggerMs: 110, reducedMotion: stage.reducedMotion });
      break;
    case "surface": {
      const from = planets.get(entry.experimentId);
      cosmos.setPalette(from?.look.palette ?? DASHBOARD_PALETTE, 0);
      sound.setBedLevel(1, 2.6);
      if (from && !stage.reducedMotion) {
        from.body.setTravel(1);
        cosmos.focus(from.body);
        void cosmos.warpTo(0.3, 0).then(() => cosmos.warpTo(0, 1600, ease.outCubic));
        sound.sweep("rise", 1.3);
        void veil.hide(650);
        void from.body.travel(0, 1500).then(() => {
          if (!focusedId) cosmos.focus(null);
          cosmos.setPalette(DASHBOARD_PALETTE, 1400);
        });
      } else {
        void veil.hide(stage.time(500));
        cosmos.setPalette(DASHBOARD_PALETTE, stage.time(900));
      }
      void revealIn(revealTargets, { delayMs: stage.reducedMotion ? 0 : 700, staggerMs: 80, reducedMotion: stage.reducedMotion });
      break;
    }
    default:
      cosmos.setPalette(DASHBOARD_PALETTE, entry.kind === "open" ? 0 : stage.time(900));
      sound.setBedLevel(1, 2);
      if (veil.showing) void veil.hide(stage.time(entry.kind === "open" ? 1400 : 500));
      void revealIn(revealTargets, { delayMs: entry.kind === "open" ? 300 : 120, staggerMs: 90, reducedMotion: stage.reducedMotion });
  }

  // On phones the options sit in a dropdown opened by the menu button (see views.css).
  const setMenuOpen = (open: boolean): void => {
    if (topbar.classList.contains("is-menu-open") === open) return;
    topbar.classList.toggle("is-menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    sound.cue(open ? "open" : "close");
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

  return {
    async leave(to) {
      window.clearTimeout(unfocusTimer);
      const exit = transitionFor({ name: "dashboard" }, to);
      if (exit.kind === "dive") {
        const target = planets.get(exit.experimentId);
        const palette = target?.look.palette ?? DASHBOARD_PALETTE;
        veil.setLabel(`Opening ${target?.experiment.title ?? "experiment"}`);
        sound.setBedLevel(0, 2.2);
        if (target && !stage.reducedMotion) {
          // Fall into the planet: the page dissolves, the planet swells to fill the sky.
          sound.cue("select", { midi: target.look.note });
          sound.sweep("dive", 1.35);
          cosmos.focus(target.body);
          cosmos.setPalette(palette, 900);
          for (const [id, other] of planets) if (id !== exit.experimentId) other.body.setHighlight(false);
          target.body.setHighlight(true);
          const veilDelay = window.setTimeout(() => void veil.show(palette, 520), 980);
          await Promise.all([
            target.body.travel(1, 1450),
            cosmos.warpTo(0.32, 1300, ease.inCubic),
            departOut(main, { scale: 0.97, lift: 0, durationMs: 520 }),
            departOut(topbar, { lift: -10, durationMs: 420 }),
          ]);
          window.clearTimeout(veilDelay);
          await veil.show(palette, 260);
          return;
        }
        await veil.show(palette, stage.time(420));
        return;
      }
      if (exit.kind === "depart") {
        sound.sweep("warp", 0.75);
        cosmos.setPalette(LOGIN_PALETTE, stage.time(1200));
        await Promise.all([
          cosmos.warpTo(0.7, stage.time(750), ease.inCubic),
          departOut(main, { scale: 0.94, durationMs: 520, reducedMotion: stage.reducedMotion }),
          departOut(topbar, { durationMs: 420, reducedMotion: stage.reducedMotion }),
        ]);
        return;
      }
      await departOut(main, { reducedMotion: stage.reducedMotion });
    },
    dispose() {
      window.clearTimeout(unfocusTimer);
      for (const remove of planetListeners) remove();
      menuToggle.removeEventListener("click", onMenuToggle);
      settingsButton.removeEventListener("click", onSettings);
      signOutButton.removeEventListener("click", onSignOut);
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeydown);
      settings.dispose();
      soundToggle.dispose();
      cosmos.focus(null);
      for (const orbit of orbits) orbit.remove();
      for (const { body } of planets.values()) body.remove();
      for (const star of stars) star.remove();
      root.replaceChildren();
    },
  };

  function renderSystem({ subject, experiments }: SubjectSection): { element: HTMLElement; build(): void } {
    const look = systemLook(subject.id);
    const headingId = `subject-${subject.id}`;
    const starAnchor = el("div", { class: "system-star", "aria-hidden": "true" });
    starAnchor.style.setProperty("--star-size", `${look.size}px`);
    starAnchor.style.setProperty("--star-core", look.star.core);
    starAnchor.style.setProperty("--star-edge", look.star.edge);
    const dormant = experiments.length === 0;
    const planetItems = experiments.map((experiment) => renderPlanet(experiment));
    const listItems = dormant
      ? [
          el(
            "li",
            { class: "experiment-card is-empty", "data-subject": subject.id },
            el("h3", {}, "Coming soon"),
            el("p", {}, `${subject.label} experiments are on the way.`),
          ),
        ]
      : planetItems.map((item) => item.element);
    const element = el(
      "section",
      {
        class: `system${dormant ? " is-dormant" : ""}`,
        "aria-labelledby": headingId,
        "data-subject": subject.id,
      },
      starAnchor,
      el("h2", { id: headingId }, subject.label),
      el(
        "p",
        { class: "system-count" },
        dormant ? "Coming soon" : `${experiments.length} ${experiments.length === 1 ? "experiment" : "experiments"}`,
      ),
      el("ul", { class: "experiment-list" }, ...listItems),
    );
    element.style.setProperty("--system-accent", look.accent);
    return {
      element,
      build() {
        const star = cosmos.addStar(look.star);
        star.anchorTo(starAnchor);
        stars.push(star);
        planetItems.forEach((item, index) => {
          const body = cosmos.addPlanet({ ...item.look.planet, lightFrom: star, lightDepth: 0.55 });
          body.anchorTo(item.anchor);
          orbits.push(cosmos.addOrbit(star, body, { color: look.orbitColor, phase: index * 0.37 }));
          planets.set(item.experiment.id, {
            experiment: item.experiment,
            look: item.look,
            body,
            star,
            link: item.link,
            mood: look.mood,
          });
        });
      },
    };
  }

  function renderPlanet(experiment: Experiment): {
    element: HTMLElement;
    experiment: Experiment;
    look: PlanetLook;
    anchor: HTMLElement;
    link: HTMLAnchorElement;
  } {
    const look = planetLook(experiment.id);
    const anchor = el("span", { class: "planet-anchor", "aria-hidden": "true" });
    const link = el(
      "a",
      {
        class: "planet-link",
        href: routeHash({ name: "experiment", id: experiment.id }),
        "aria-label": `Open ${experiment.title}`,
      },
      anchor,
      el("h3", { class: "planet-name" }, experiment.title),
      el(
        "span",
        { class: "card-meta" },
        el("span", { class: "badge" }, `${experiment.estimatedMinutes} min`),
        experiment.releaseStatus === "draft" && el("span", { class: "badge status-draft" }, "Draft"),
      ),
      el("span", { class: "planet-cta", "aria-hidden": "true" }, "Open"),
    );
    const element = el("li", { class: "experiment-card planet", "data-experiment": experiment.id }, link);
    element.style.setProperty("--planet-size", `${look.size}px`);
    element.style.setProperty("--planet-a", look.planet.colors[0]);
    element.style.setProperty("--planet-b", look.planet.colors[1]);
    element.style.setProperty("--planet-c", look.planet.colors[2]);
    element.style.setProperty("--planet-atmosphere", look.planet.atmosphere);
    return { element, experiment, look, anchor, link };
  }
}

interface SettingsDialog {
  readonly dialog: HTMLDialogElement;
  open(): void;
  dispose(): void;
}

function buildSettingsDialog(
  stage: Stage,
  getSession: () => Session,
  rename: (name: string) => boolean,
  onSignOut: () => void,
  onSoundChanged: () => void,
): SettingsDialog {
  const { sound } = stage;
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
  const soundToggle: SoundToggle = createSoundToggle(sound, "sound-toggle is-wide");
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
      el("h3", {}, "Space sounds"),
      el("div", { class: "settings-row" }, el("p", {}, "Music and sound effects on this screen."), soundToggle.element),
      el("h3", {}, "Narration and captions"),
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
      sound.cue("deny");
      return;
    }
    if (rename(result.value)) {
      name.value = result.value;
      status.textContent = "Saved.";
      status.classList.add("is-ok");
      sound.cue("confirm");
    }
  };
  const onClose = (): void => dialog.close();
  const onClosed = (): void => {
    sound.cue("close");
    onSoundChanged();
  };
  const onBackdrop = (event: MouseEvent): void => {
    if (event.target === dialog) dialog.close();
  };
  form.addEventListener("submit", onSubmit);
  close.addEventListener("click", onClose);
  signOut.addEventListener("click", onSignOut);
  dialog.addEventListener("click", onBackdrop);
  dialog.addEventListener("close", onClosed);

  return {
    dialog,
    open() {
      name.value = getSession().username;
      status.textContent = "";
      status.classList.remove("is-ok");
      soundToggle.sync();
      dialog.showModal();
      sound.cue("open");
    },
    dispose() {
      form.removeEventListener("submit", onSubmit);
      close.removeEventListener("click", onClose);
      signOut.removeEventListener("click", onSignOut);
      dialog.removeEventListener("click", onBackdrop);
      dialog.removeEventListener("close", onClosed);
      soundToggle.dispose();
      if (dialog.open) dialog.close();
    },
  };
}
