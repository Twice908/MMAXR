import { SETTLE_EASING } from "./dom.js";

/** Options for {@link createJourneyCaptions}. */
export interface JourneyCaptionsOptions {
  /** Small heading above the status line, such as the experiment's title. */
  readonly title: string;
  /** Accent colour for the caret, bar and text glow. */
  readonly accent: string;
  /** Called when the student presses Skip or Escape. Omit to hide the button. */
  readonly onSkip?: () => void;
}

/** Loader captions shown over a journey. */
export interface JourneyCaptions {
  readonly element: HTMLElement;
  /** Type a new status line. Repeating the current line does nothing. */
  setLine(text: string): void;
  /** Fill the progress bar, from 0 to 1. */
  setProgress(progress: number): void;
  /** Remove the Skip button (for example once the descent has arrived). */
  hideSkip(): void;
  /** Fade out and remove. */
  finish(durationMs: number): Promise<void>;
  dispose(): void;
}

const FONT = "'Avenir Next', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Cinematic loader captions: a title, a status line that types itself in with a blinking caret
 * and pulsing dots, a thin progress bar with a percentage, and a Skip button. Status lines are
 * announced politely to screen readers.
 */
export function createJourneyCaptions(parent: HTMLElement, options: JourneyCaptionsOptions): JourneyCaptions {
  const root = document.createElement("div");
  root.className = "mma-journey-captions";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "58",
    pointerEvents: "none",
    display: "grid",
    gridTemplateRows: "1fr auto",
    justifyItems: "center",
    padding: "max(16px, env(safe-area-inset-top)) 16px max(36px, env(safe-area-inset-bottom))",
    fontFamily: FONT,
    color: "#ffffff",
  } satisfies Partial<CSSStyleDeclaration>);

  const skip = document.createElement("button");
  skip.type = "button";
  skip.textContent = "Skip";
  skip.setAttribute("aria-label", "Skip intro");
  Object.assign(skip.style, {
    position: "absolute",
    top: "max(16px, env(safe-area-inset-top))",
    right: "16px",
    minWidth: "64px",
    minHeight: "44px",
    padding: "0 16px",
    border: "1px solid rgba(255, 255, 255, 0.28)",
    borderRadius: "999px",
    color: "#ffffff",
    background: "rgba(6, 7, 20, 0.45)",
    font: `700 12px/1 ${FONT}`,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    cursor: "pointer",
    pointerEvents: "auto",
    backdropFilter: "blur(8px)",
  } satisfies Partial<CSSStyleDeclaration>);

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    gridRow: "2",
    display: "grid",
    justifyItems: "center",
    gap: "12px",
    width: "min(100%, 520px)",
    textAlign: "center",
  } satisfies Partial<CSSStyleDeclaration>);

  const eyebrow = document.createElement("p");
  eyebrow.textContent = options.title;
  Object.assign(eyebrow.style, {
    margin: "0",
    font: `800 11px/1 ${FONT}`,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    color: options.accent,
    textShadow: `0 0 18px ${options.accent}`,
  } satisfies Partial<CSSStyleDeclaration>);

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, {
    margin: "0",
    minHeight: "1.4em",
    font: `600 clamp(17px, 2.6vw, 22px)/1.35 ${FONT}`,
    letterSpacing: "0.01em",
    textShadow: `0 0 24px ${options.accent}, 0 2px 14px rgba(0, 0, 0, 0.85)`,
  } satisfies Partial<CSSStyleDeclaration>);
  const text = document.createElement("span");
  const caret = document.createElement("span");
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "▍";
  Object.assign(caret.style, { marginLeft: "3px", color: options.accent } satisfies Partial<CSSStyleDeclaration>);
  const dots = document.createElement("span");
  dots.setAttribute("aria-hidden", "true");
  Object.assign(dots.style, { display: "inline-flex", gap: "4px", marginLeft: "8px", verticalAlign: "middle" } satisfies Partial<CSSStyleDeclaration>);
  const dotElements = [0, 1, 2].map(() => {
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      background: options.accent,
      boxShadow: `0 0 8px ${options.accent}`,
    } satisfies Partial<CSSStyleDeclaration>);
    dots.append(dot);
    return dot;
  });
  status.append(text, caret, dots);

  const meter = document.createElement("div");
  Object.assign(meter.style, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: "10px",
    width: "min(100%, 300px)",
  } satisfies Partial<CSSStyleDeclaration>);
  meter.setAttribute("aria-hidden", "true");
  const track = document.createElement("div");
  Object.assign(track.style, {
    height: "2px",
    borderRadius: "2px",
    background: "rgba(255, 255, 255, 0.14)",
    overflow: "hidden",
  } satisfies Partial<CSSStyleDeclaration>);
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    height: "100%",
    width: "100%",
    transformOrigin: "left center",
    transform: "scaleX(0)",
    background: `linear-gradient(90deg, rgba(255,255,255,0.4), ${options.accent})`,
    boxShadow: `0 0 10px ${options.accent}`,
  } satisfies Partial<CSSStyleDeclaration>);
  track.append(bar);
  const percent = document.createElement("span");
  Object.assign(percent.style, {
    minWidth: "3.2em",
    font: `700 11px/1 ${FONT}`,
    letterSpacing: "0.12em",
    color: "rgba(255, 255, 255, 0.7)",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  } satisfies Partial<CSSStyleDeclaration>);
  percent.textContent = "0%";
  meter.append(track, percent);

  panel.append(eyebrow, status, meter);
  root.append(panel);
  if (options.onSkip) root.append(skip);
  parent.append(root);

  // Blinking caret and pulsing dots: the "still working" heartbeat of the loader.
  const loops: Animation[] = [];
  if (typeof caret.animate === "function") {
    loops.push(
      caret.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.51 }, { opacity: 0 }], {
        duration: 900,
        iterations: Infinity,
      }),
    );
    dotElements.forEach((dot, index) => {
      loops.push(
        dot.animate(
          [
            { opacity: 0.2, transform: "scale(0.7)" },
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0.2, transform: "scale(0.7)" },
          ],
          { duration: 1100, delay: index * 180, iterations: Infinity, easing: "ease-in-out" },
        ),
      );
    });
    panel.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
      duration: 700,
      easing: SETTLE_EASING,
    });
  }

  let current = "";
  let typing = 0;
  const typeLine = (line: string): void => {
    window.clearInterval(typing);
    let shown = 0;
    text.textContent = "";
    typing = window.setInterval(() => {
      shown += 2;
      text.textContent = line.slice(0, shown);
      if (shown >= line.length) window.clearInterval(typing);
    }, 22);
  };

  const onSkip = (): void => options.onSkip?.();
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") onSkip();
  };
  skip.addEventListener("click", onSkip);
  if (options.onSkip) document.addEventListener("keydown", onKey);

  const dispose = (): void => {
    window.clearInterval(typing);
    for (const loop of loops) loop.cancel();
    skip.removeEventListener("click", onSkip);
    document.removeEventListener("keydown", onKey);
    root.remove();
  };

  return {
    element: root,
    setLine(line) {
      if (line === current) return;
      current = line;
      if (typeof status.animate === "function") {
        status.animate([{ opacity: 0.25, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)" }], {
          duration: 380,
          easing: SETTLE_EASING,
        });
      }
      typeLine(line);
    },
    setProgress(progress) {
      const clamped = Math.min(1, Math.max(0, progress));
      bar.style.transform = `scaleX(${clamped})`;
      percent.textContent = `${Math.round(clamped * 100)}%`;
    },
    hideSkip() {
      skip.remove();
      document.removeEventListener("keydown", onKey);
    },
    finish(durationMs) {
      if (durationMs <= 0 || typeof root.animate !== "function") {
        dispose();
        return Promise.resolve();
      }
      return root
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: durationMs, easing: "ease-out", fill: "forwards" })
        .finished.then(dispose, dispose);
    },
    dispose,
  };
}
