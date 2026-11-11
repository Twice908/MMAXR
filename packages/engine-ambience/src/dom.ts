import type { Soundscape } from "./soundscape.js";

/** Shared timing for screen motion: a soft "settle" curve, the way physical things come to rest. */
export const SETTLE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Accelerating curve for things leaving. */
export const DEPART_EASING = "cubic-bezier(0.55, 0, 0.75, 0.2)";

/** Options for {@link revealIn}. */
export interface RevealOptions {
  /** Wait before the first element, in milliseconds. */
  readonly delayMs?: number;
  /** Extra wait per element. */
  readonly staggerMs?: number;
  readonly durationMs?: number;
  /** Rise distance in pixels. */
  readonly rise?: number;
  readonly reducedMotion?: boolean;
}

/**
 * Bring elements in one after another: each rises a little, sharpens from a slight blur and fades
 * in, so the page assembles like objects coming into focus. Reduced motion uses a short fade only.
 */
export function revealIn(elements: readonly Element[], options: RevealOptions = {}): Promise<void> {
  const reduced = options.reducedMotion ?? false;
  const delay = options.delayMs ?? 0;
  const stagger = reduced ? 0 : (options.staggerMs ?? 70);
  const duration = reduced ? 200 : (options.durationMs ?? 900);
  const rise = reduced ? 0 : (options.rise ?? 18);
  const running = elements.map((element, index) => {
    if (typeof element.animate !== "function") return Promise.resolve();
    const keyframes: Keyframe[] = reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: `translate3d(0, ${rise}px, 0) scale(0.985)`, filter: "blur(6px)" },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0px)" },
        ];
    return element
      .animate(keyframes, { duration, delay: delay + index * stagger, easing: SETTLE_EASING, fill: "backwards" })
      .finished.then(
        () => undefined,
        () => undefined,
      );
  });
  return Promise.all(running).then(() => undefined);
}

/** Options for {@link departOut}. */
export interface DepartOptions {
  readonly durationMs?: number;
  /** Final scale: below 1 recedes into the distance, above 1 rushes past the viewer. */
  readonly scale?: number;
  readonly lift?: number;
  readonly reducedMotion?: boolean;
}

/** Send an element away: it accelerates, blurs and fades, and stays hidden until removed. */
export function departOut(element: Element, options: DepartOptions = {}): Promise<void> {
  if (typeof element.animate !== "function") return Promise.resolve();
  const reduced = options.reducedMotion ?? false;
  const keyframes: Keyframe[] = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0px)" },
        {
          opacity: 0,
          transform: `translate3d(0, ${options.lift ?? -16}px, 0) scale(${options.scale ?? 0.94})`,
          filter: "blur(8px)",
        },
      ];
  return element
    .animate(keyframes, { duration: reduced ? 180 : (options.durationMs ?? 620), easing: DEPART_EASING, fill: "forwards" })
    .finished.then(
      () => undefined,
      () => undefined,
    );
}

/** A small, gentle shake for a refused action. Skipped under reduced motion. */
export function shake(element: Element, reducedMotion = false): void {
  if (reducedMotion || typeof element.animate !== "function") return;
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-9px)" },
      { transform: "translateX(7px)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
  );
}

/** A sound on/off button. */
export interface SoundToggle {
  readonly element: HTMLButtonElement;
  /** Refresh the pressed state, if sound was switched elsewhere. */
  sync(): void;
  dispose(): void;
}

/**
 * A button that switches the soundscape on and off. It is labelled "Sound" for screen readers and
 * shows its state with `aria-pressed`, a speaker icon and a short word. Pressing it also counts
 * as the gesture that lets audio start.
 */
export function createSoundToggle(sound: Soundscape, className = "sound-toggle"): SoundToggle {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.setAttribute("aria-label", "Sound");
  element.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/>
      <path class="sound-wave" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path class="sound-off" d="M15.4 9.6l5 5M20.4 9.6l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span class="sound-toggle-state" aria-hidden="true"></span>`;
  const state = element.querySelector<HTMLSpanElement>(".sound-toggle-state");
  const sync = (): void => {
    element.setAttribute("aria-pressed", String(sound.enabled));
    element.classList.toggle("is-off", !sound.enabled);
    if (state) state.textContent = sound.enabled ? "On" : "Off";
  };
  const onClick = (): void => {
    const next = !sound.enabled;
    sound.unlock();
    sound.setEnabled(next);
    if (next) sound.cue("confirm");
    sync();
  };
  element.addEventListener("click", onClick);
  sync();
  return {
    element,
    sync,
    dispose() {
      element.removeEventListener("click", onClick);
    },
  };
}
