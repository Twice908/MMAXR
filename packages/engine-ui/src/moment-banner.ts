/** A mission-moment banner over a lesson's stage (import `@mma/engine-ui/moment-banner.css`). */
export interface MomentBanner {
  readonly element: HTMLElement;
  /**
   * Show a moment for `durationMs`: a small capitals eyebrow, a big title and a short line, with
   * an expanding ring of light. `lesson` uses gold for the end of a lesson. Back-to-back moments
   * restart the entrance.
   */
  show(tone: "mission" | "lesson", eyebrow: string, title: string, line: string, durationMs?: number): void;
  hide(): void;
  dispose(): void;
}

/**
 * Create the moment banner inside `host` (usually the stage), centred over it. It never takes
 * pointer input and is announced politely to screen readers.
 */
export function createMomentBanner(host: HTMLElement): MomentBanner {
  host.classList.add("mma-moment-host");
  const element = document.createElement("div");
  element.className = "mma-moment";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  const eyebrow = document.createElement("p");
  eyebrow.className = "mma-moment__eyebrow";
  const title = document.createElement("p");
  title.className = "mma-moment__title";
  const line = document.createElement("p");
  line.className = "mma-moment__line";
  element.append(eyebrow, title, line);
  host.append(element);

  let timer = 0;
  const hide = (): void => {
    window.clearTimeout(timer);
    element.hidden = true;
    element.classList.remove("is-playing");
  };
  return {
    element,
    show(tone, eyebrowText, titleText, lineText, durationMs = tone === "lesson" ? 4200 : 3000) {
      eyebrow.textContent = eyebrowText;
      title.textContent = titleText;
      line.textContent = lineText;
      element.dataset.tone = tone;
      element.style.setProperty("--mma-moment-duration", `${durationMs}ms`);
      element.hidden = false;
      element.classList.remove("is-playing");
      void element.offsetWidth;
      element.classList.add("is-playing");
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, durationMs);
    },
    hide,
    dispose() {
      hide();
      element.remove();
      host.classList.remove("mma-moment-host");
    },
  };
}
