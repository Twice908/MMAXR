import { el } from "./dom.js";

/**
 * Phone AR heads-up display on the WebXR DOM overlay, shared by modules. Generalised
 * from the Atom Builder HUD (which stays in that module): a slim top bar (status,
 * Reset view, Exit), a bottom tab bar in the thumb zone, and one sheet at a time. The
 * module's own page sections move into the sheets while AR runs, so every control
 * keeps its handler, and move back when AR ends.
 */

/** One HUD tab and the page sections shown in its sheet. */
export interface XrHudTab {
  readonly id: string;
  readonly label: string;
  /** Inner SVG markup for a 24x24 stroke icon. */
  readonly icon: string;
  readonly sections: readonly HTMLElement[];
}

/** Options for {@link createXrHud}. */
export interface XrHudOptions {
  /** Element the HUD is added to (inside the DOM overlay root). */
  readonly host: HTMLElement;
  readonly tabs: readonly XrHudTab[];
  /** Page elements kept visible above the sheet while AR runs (instruction, feedback). */
  readonly live?: readonly HTMLElement[];
  /** Short gesture tip shown for a few seconds when AR starts. */
  readonly tip: string;
  readonly onResetView: () => void;
}

/** A mounted HUD. */
export interface XrHud {
  /** Slot in the top bar for the session's Exit button. */
  readonly exitSlot: HTMLElement;
  /** Move the sections into the sheets and show the HUD. */
  mount(): void;
  /** Return the sections to the page and hide the HUD. */
  unmount(): void;
  /** Set the top status chip, for example "Mission 1 of 2 · Move an electron". */
  setStatus(text: string): void;
  /** Open a tab's sheet (or close with null). */
  open(tabId: string | null): void;
  /** Show a dot on a closed tab to say something changed there. */
  flag(tabId: string): void;
  dispose(): void;
}

/** The tab that opens after a tab tap: tapping the open tab closes its sheet. */
export function nextHudTab(open: string | null, tapped: string): string | null {
  return open === tapped ? null : tapped;
}

const RESET_ICON = '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>';
const CLOSE_ICON = '<path d="M6 6l12 12M18 6L6 18"/>';

function svg(inner: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** Build the HUD (hidden until {@link XrHud.mount}). */
export function createXrHud(options: XrHudOptions): XrHud {
  const doc = options.host.ownerDocument;
  const hud = el(doc, "div", "mma-xr-hud");
  hud.hidden = true;

  const top = el(doc, "header", "mma-xr-hud__top");
  const status = el(doc, "p", "mma-xr-hud__status");
  status.setAttribute("aria-live", "polite");
  const reset = el(doc, "button", "mma-xr-hud__round");
  reset.type = "button";
  reset.setAttribute("aria-label", "Reset view");
  reset.innerHTML = svg(RESET_ICON);
  const exitSlot = el(doc, "div", "mma-xr-hud__exit");
  top.append(status, reset, exitSlot);

  const tip = el(doc, "p", "mma-xr-hud__tip", options.tip);
  tip.setAttribute("role", "status");
  tip.hidden = true;
  const liveSlot = el(doc, "div", "mma-xr-hud__live");

  const sheet = el(doc, "section", "mma-xr-hud__sheet");
  sheet.id = "mma-xr-hud-sheet";
  sheet.setAttribute("role", "tabpanel");
  sheet.hidden = true;
  const sheetHead = el(doc, "header", "mma-xr-hud__sheet-head");
  const sheetTitle = el(doc, "h2", "mma-xr-hud__sheet-title");
  sheetTitle.id = "mma-xr-hud-sheet-title";
  const close = el(doc, "button", "mma-xr-hud__round");
  close.type = "button";
  close.setAttribute("aria-label", "Close panel");
  close.innerHTML = svg(CLOSE_ICON);
  sheetHead.append(sheetTitle, close);
  sheet.append(sheetHead);
  const bodies = new Map<string, HTMLElement>();
  for (const tab of options.tabs) {
    const body = el(doc, "div", "mma-xr-hud__body");
    body.hidden = true;
    bodies.set(tab.id, body);
    sheet.append(body);
  }

  const nav = el(doc, "nav", "mma-xr-hud__tabs");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Lesson");
  const tabButtons = new Map<string, HTMLButtonElement>();
  for (const tab of options.tabs) {
    const button = el(doc, "button", "mma-xr-hud__tab");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", sheet.id);
    button.setAttribute("aria-selected", "false");
    button.dataset.hudTab = tab.id;
    button.innerHTML = `${svg(tab.icon)}<span>${tab.label}</span><i class="mma-xr-hud__badge" hidden></i>`;
    tabButtons.set(tab.id, button);
    nav.append(button);
  }
  hud.append(top, tip, liveSlot, sheet, nav);
  options.host.append(hud);

  type Home = { element: HTMLElement; parent: Node; next: Node | null };
  let homes: Home[] = [];
  let mounted = false;
  let openTab: string | null = null;
  let tipTimeout: ReturnType<typeof setTimeout> | null = null;

  const open = (tabId: string | null): void => {
    openTab = tabId;
    sheet.hidden = tabId === null;
    hud.classList.toggle("has-sheet", tabId !== null);
    for (const tab of options.tabs) {
      const selected = tab.id === tabId;
      const button = tabButtons.get(tab.id)!;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected || (tabId === null && tab === options.tabs[0]) ? 0 : -1;
      bodies.get(tab.id)!.hidden = !selected;
      if (selected) {
        button.querySelector<HTMLElement>(".mma-xr-hud__badge")!.hidden = true;
        sheetTitle.textContent = tab.label;
        sheet.setAttribute("aria-labelledby", sheetTitle.id);
      }
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const tabId = target?.closest<HTMLElement>("[data-hud-tab]")?.dataset.hudTab;
    if (tabId) open(nextHudTab(openTab, tabId));
    else if (target?.closest("button") === close) open(null);
    else if (target?.closest("button") === reset) options.onResetView();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!mounted) return;
    if (event.key === "Escape" && openTab) {
      open(null);
      return;
    }
    const current = (event.target as Element | null)?.closest<HTMLElement>("[data-hud-tab]")?.dataset.hudTab;
    if (!current || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const ids = options.tabs.map((tab) => tab.id);
    const index = ids.indexOf(current);
    const next = ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length]!;
    tabButtons.get(next)?.focus();
    event.preventDefault();
  };
  hud.addEventListener("click", onClick);
  hud.addEventListener("keydown", onKeyDown);

  const unmount = (): void => {
    if (!mounted) return;
    if (tipTimeout !== null) clearTimeout(tipTimeout);
    tipTimeout = null;
    tip.hidden = true;
    for (const { element, parent, next } of [...homes].reverse()) {
      parent.insertBefore(element, next?.parentNode === parent ? next : null);
    }
    homes = [];
    mounted = false;
    open(null);
    hud.hidden = true;
  };

  return {
    exitSlot,
    mount() {
      if (mounted) return;
      homes = [...options.tabs.flatMap((tab) => tab.sections), ...(options.live ?? [])].map((element) => ({
        element,
        parent: element.parentNode!,
        next: element.nextSibling,
      }));
      for (const tab of options.tabs) bodies.get(tab.id)!.append(...tab.sections);
      liveSlot.append(...(options.live ?? []));
      mounted = true;
      hud.hidden = false;
      open(options.tabs[0]?.id ?? null);
      tip.hidden = false;
      tipTimeout = setTimeout(() => {
        tipTimeout = null;
        tip.hidden = true;
      }, 5000);
    },
    unmount,
    setStatus(text) {
      if (status.textContent !== text) status.textContent = text;
    },
    open,
    flag(tabId) {
      if (!mounted || openTab === tabId) return;
      const badge = tabButtons.get(tabId)?.querySelector<HTMLElement>(".mma-xr-hud__badge");
      if (badge) badge.hidden = false;
    },
    dispose() {
      unmount();
      hud.removeEventListener("click", onClick);
      hud.removeEventListener("keydown", onKeyDown);
      hud.remove();
    },
  };
}
