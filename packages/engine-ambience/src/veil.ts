import { paletteGradient, type CosmosPalette } from "./palette.js";

/**
 * A full-screen colour wash that covers a scene change (a lesson loading, the page appearing).
 * It never takes pointer input, so it cannot trap the student.
 */
export interface Veil {
  readonly element: HTMLElement;
  /** True while the veil is fully or partly showing. */
  readonly showing: boolean;
  /** Fade in over `durationMs`, coloured by the palette (or a plain colour). */
  show(fill: CosmosPalette | string, durationMs: number): Promise<void>;
  /** Fade out over `durationMs`. */
  hide(durationMs: number): Promise<void>;
  /** Set the status text read by screen readers and shown small at the bottom. Empty hides it. */
  setLabel(text: string): void;
  dispose(): void;
}

/** Create a veil inside `parent` (usually `document.body`). It starts hidden unless `initial` is given. */
export function createVeil(parent: HTMLElement, initial?: CosmosPalette | string): Veil {
  const element = document.createElement("div");
  element.className = "mma-veil";
  Object.assign(element.style, {
    position: "fixed",
    inset: "0",
    zIndex: "60",
    pointerEvents: "none",
    display: "grid",
    alignItems: "end",
    justifyItems: "center",
    padding: "0 16px max(32px, env(safe-area-inset-bottom))",
    opacity: initial ? "1" : "0",
    visibility: initial ? "visible" : "hidden",
  } satisfies Partial<CSSStyleDeclaration>);
  const label = document.createElement("p");
  label.setAttribute("role", "status");
  Object.assign(label.style, {
    margin: "0",
    color: "rgba(255, 255, 255, 0.82)",
    font: "600 12px/1.4 'Avenir Next', 'Segoe UI', Roboto, sans-serif",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    textShadow: "0 1px 12px rgba(0, 0, 0, 0.6)",
  } satisfies Partial<CSSStyleDeclaration>);
  element.append(label);
  parent.append(element);

  const paint = (fill: CosmosPalette | string): void => {
    element.style.background = typeof fill === "string" ? fill : paletteGradient(fill);
  };
  if (initial) paint(initial);

  let animation: Animation | null = null;
  let showing = Boolean(initial);
  let opacity = initial ? 1 : 0;

  const fadeTo = (target: number, durationMs: number): Promise<void> => {
    animation?.cancel();
    element.style.visibility = "visible";
    const from = opacity;
    opacity = target;
    if (durationMs <= 0 || typeof element.animate !== "function") {
      element.style.opacity = String(target);
      if (target === 0) element.style.visibility = "hidden";
      return Promise.resolve();
    }
    element.style.opacity = String(target);
    const running = element.animate([{ opacity: from }, { opacity: target }], {
      duration: durationMs,
      easing: target > from ? "cubic-bezier(0.4, 0, 0.2, 1)" : "cubic-bezier(0.2, 0, 0, 1)",
    });
    animation = running;
    return running.finished.then(
      () => {
        if (animation === running && target === 0) element.style.visibility = "hidden";
      },
      () => undefined,
    );
  };

  return {
    element,
    get showing() {
      return showing;
    },
    show(fill, durationMs) {
      paint(fill);
      showing = true;
      return fadeTo(1, durationMs);
    },
    hide(durationMs) {
      showing = false;
      return fadeTo(0, durationMs);
    },
    setLabel(text) {
      label.textContent = text;
    },
    dispose() {
      animation?.cancel();
      element.remove();
    },
  };
}
