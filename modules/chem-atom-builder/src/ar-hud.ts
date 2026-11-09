/**
 * Phone AR heads-up display (WebXR DOM overlay).
 *
 * Layout follows the Horizon UI kit's patterns, adapted for a handheld screen:
 * a slim top bar (status + Reset view + Exit), a bottom tab bar in the thumb
 * zone, and one sheet at a time above it. The camera view stays clear unless
 * the learner opens a sheet. The existing lesson elements are moved into the
 * sheets while AR runs, so every button keeps its handler.
 */

/** The four HUD sections, in tab order. */
export const AR_HUD_TABS = ["mission", "build", "element", "sound"] as const;
export type ArHudTab = (typeof AR_HUD_TABS)[number];

const TAB_LABELS: Record<ArHudTab, string> = {
  mission: "Mission",
  build: "Build",
  element: "Element",
  sound: "Sound",
};

/** Lesson elements shown in each sheet, by selector. */
const TAB_CONTENT: Record<ArHudTab, readonly string[]> = {
  mission: ["#lesson-panel", "#assessment-card", "#lesson-summary", "#free-play-status"],
  build: [".particle-rail"],
  element: [".atom-inspector"],
  sound: [".narration-hud"],
};

const ICONS: Record<ArHudTab | "reset" | "close", string> = {
  mission: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
  build: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
  element: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 15V9l3 4 3-4v6"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

function icon(name: keyof typeof ICONS): string {
  return `<svg class="ar-hud-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

/**
 * Next open tab after a tab tap: tapping the open tab closes its sheet
 * (returning the full camera view); tapping another tab switches to it.
 */
export function nextArHudTab(open: ArHudTab | null, tapped: ArHudTab): ArHudTab | null {
  return open === tapped ? null : tapped;
}

/** Text for the top status chip: the mission step and title, or the free-play label. */
export function arHudStatusText(step: string, title: string, freePlay: boolean): string {
  if (freePlay) return "Free play";
  const parts = [step.trim(), title.trim()].filter((part) => part.length > 0);
  return parts.join(" · ");
}

export interface ArHud {
  /** The exit button's slot in the top bar. */
  readonly exitSlot: HTMLElement;
  /** Move the lesson elements into the HUD and show it (or keep it hidden for headsets). */
  mount(visible: boolean): void;
  /** Return the lesson elements to the page and hide the HUD. */
  unmount(): void;
  dispose(): void;
}

/** Build the phone AR HUD inside `builder`. Elements are found under `root`. */
export function createArHud(root: HTMLElement, builder: HTMLElement, onResetView: () => void): ArHud {
  const hud = document.createElement("div");
  hud.className = "ar-hud";
  hud.hidden = true;
  hud.innerHTML = `
    <header class="ar-hud-top">
      <p class="ar-hud-status" aria-live="polite"></p>
      <button type="button" class="ar-hud-round" data-hud-action="reset-view" aria-label="Reset view" title="Reset view">${icon("reset")}</button>
      <div class="ar-hud-exit-slot"></div>
    </header>
    <p class="ar-hud-tip" role="status" hidden>Pinch to resize. Drag to turn the atom.</p>
    <div class="ar-hud-caption-slot"></div>
    <section class="ar-hud-sheet" id="ar-hud-sheet" role="tabpanel" hidden>
      <header class="ar-hud-sheet-head">
        <h2 class="ar-hud-sheet-title" id="ar-hud-sheet-title"></h2>
        <button type="button" class="ar-hud-round ar-hud-close" data-hud-action="close" aria-label="Close panel">${icon("close")}</button>
      </header>
      ${AR_HUD_TABS.map((tab) => `<div class="ar-hud-body" data-hud-body="${tab}" hidden></div>`).join("")}
    </section>
    <nav class="ar-hud-tabs" role="tablist" aria-label="Lesson">
      ${AR_HUD_TABS.map((tab) => `
        <button type="button" role="tab" class="ar-hud-tab" data-hud-tab="${tab}" aria-selected="false" aria-controls="ar-hud-sheet">
          ${icon(tab)}<span>${TAB_LABELS[tab]}</span><i class="ar-hud-badge" hidden></i>
        </button>`).join("")}
    </nav>
  `;
  builder.append(hud);

  const q = <T extends Element>(selector: string): T => {
    const element = hud.querySelector<T>(selector);
    if (!element) throw new Error(`AR HUD element ${selector} is missing.`);
    return element;
  };
  const status = q<HTMLElement>(".ar-hud-status");
  const tip = q<HTMLElement>(".ar-hud-tip");
  const sheet = q<HTMLElement>(".ar-hud-sheet");
  const sheetTitle = q<HTMLElement>(".ar-hud-sheet-title");
  const captionSlot = q<HTMLElement>(".ar-hud-caption-slot");
  const exitSlot = q<HTMLElement>(".ar-hud-exit-slot");

  const find = (selector: string): HTMLElement => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`The AR HUD could not find ${selector}.`);
    return element;
  };
  const placements = AR_HUD_TABS.flatMap((tab) =>
    TAB_CONTENT[tab].map((selector) => ({ tab, element: find(selector) })));
  const caption = find("#narration-caption");
  const missionStep = find("#mission-step");
  const missionTitle = find("#mission-title");
  const freePlayStatus = find("#free-play-status");
  const assessment = find("#assessment-card");
  const missionSignals = [find("#mission-feedback"), find("#hint-feedback"), assessment, find("#lesson-summary")];

  type Home = { element: HTMLElement; parent: Node; next: Node | null };
  let homes: Home[] = [];
  let mounted = false;
  let openTab: ArHudTab | null = null;
  let tipTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

  const tabButton = (tab: ArHudTab): HTMLButtonElement => q<HTMLButtonElement>(`[data-hud-tab="${tab}"]`);
  const setOpen = (tab: ArHudTab | null): void => {
    openTab = tab;
    sheet.hidden = tab === null;
    hud.classList.toggle("has-sheet", tab !== null);
    for (const name of AR_HUD_TABS) {
      const selected = name === tab;
      const button = tabButton(name);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected || (tab === null && name === "mission") ? 0 : -1;
      q<HTMLElement>(`[data-hud-body="${name}"]`).hidden = !selected;
      if (selected) button.querySelector<HTMLElement>(".ar-hud-badge")!.hidden = true;
    }
    if (tab) {
      sheetTitle.textContent = TAB_LABELS[tab];
      sheet.setAttribute("aria-labelledby", "ar-hud-sheet-title");
      q<HTMLElement>(`[data-hud-body="${tab}"]`).scrollTop = 0;
    }
  };
  const updateStatus = (): void => {
    status.textContent = arHudStatusText(
      missionStep.textContent ?? "",
      missionTitle.textContent ?? "",
      !freePlayStatus.hidden,
    );
  };
  const markMission = (): void => {
    updateStatus();
    if (!mounted) return;
    // A new question needs an answer before the lesson continues: open it.
    if (!assessment.hidden && openTab !== "mission") {
      setOpen("mission");
      return;
    }
    if (openTab !== "mission") tabButton("mission").querySelector<HTMLElement>(".ar-hud-badge")!.hidden = false;
  };
  const observer = new MutationObserver(markMission);
  const statusObserver = new MutationObserver(updateStatus);

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const tab = target?.closest<HTMLElement>("[data-hud-tab]")?.dataset.hudTab as ArHudTab | undefined;
    if (tab) {
      setOpen(nextArHudTab(openTab, tab));
      return;
    }
    const action = target?.closest<HTMLElement>("[data-hud-action]")?.dataset.hudAction;
    if (action === "close") setOpen(null);
    else if (action === "reset-view") onResetView();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!mounted) return;
    if (event.key === "Escape" && openTab) {
      setOpen(null);
      return;
    }
    const current = (event.target as Element | null)?.closest<HTMLElement>("[data-hud-tab]")?.dataset.hudTab as ArHudTab | undefined;
    if (!current || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const index = AR_HUD_TABS.indexOf(current);
    const next = AR_HUD_TABS[(index + (event.key === "ArrowRight" ? 1 : AR_HUD_TABS.length - 1)) % AR_HUD_TABS.length]!;
    tabButton(next).focus();
    event.preventDefault();
  };
  hud.addEventListener("click", onClick);
  hud.addEventListener("keydown", onKeyDown);

  const mount = (visible: boolean): void => {
      if (mounted) return;
      homes = [...placements.map(({ element }) => element), caption].map((element) => ({
        element,
        parent: element.parentNode!,
        next: element.nextSibling,
      }));
      for (const { tab, element } of placements) q<HTMLElement>(`[data-hud-body="${tab}"]`).append(element);
      captionSlot.append(caption);
      for (const badge of hud.querySelectorAll<HTMLElement>(".ar-hud-badge")) badge.hidden = true;
      mounted = true;
      hud.hidden = !visible;
      updateStatus();
      setOpen("mission");
      for (const element of missionSignals) {
        observer.observe(element, { attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true, subtree: true });
      }
      for (const element of [missionStep, missionTitle, freePlayStatus]) {
        statusObserver.observe(element, { attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true, subtree: true });
      }
      if (visible) {
        tip.hidden = false;
        tipTimeout = globalThis.setTimeout(() => {
          tipTimeout = null;
          tip.hidden = true;
        }, 5000);
      }
  };
  const unmount = (): void => {
      if (!mounted) return;
      observer.disconnect();
      statusObserver.disconnect();
      if (tipTimeout !== null) globalThis.clearTimeout(tipTimeout);
      tipTimeout = null;
      tip.hidden = true;
      for (const { element, parent, next } of [...homes].reverse()) {
        parent.insertBefore(element, next?.parentNode === parent ? next : null);
      }
      homes = [];
      mounted = false;
      setOpen(null);
      hud.hidden = true;
  };

  return {
    exitSlot,
    mount,
    unmount,
    dispose() {
      unmount();
      hud.removeEventListener("click", onClick);
      hud.removeEventListener("keydown", onKeyDown);
      hud.remove();
    },
  };
}
