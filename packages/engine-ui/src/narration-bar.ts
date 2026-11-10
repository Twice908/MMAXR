import type { NarrationSpeed, NarrationViewState } from "@mma/engine-voice";

/**
 * Shared narration controls: caption, Tap to enable sound, Mute, Replay last cue, Speed,
 * Captions, and a sound status line. This is the Atom Builder's original narration bar
 * (same markup, ids and wording), moved here so every module uses it.
 */

/** What the controls do; the module connects them to its `NarrationPlayer`. */
export interface NarrationBarHandlers {
  readonly enableSound: () => void;
  readonly toggleMuted: () => void;
  readonly replay: () => void;
  readonly toggleCaptions: () => void;
  readonly setSpeed: (speed: NarrationSpeed) => void;
}

/** A mounted narration bar. */
export interface NarrationBar {
  /** The `section.narration-hud` holding the caption and controls. */
  readonly element: HTMLElement;
  /** The live caption (`#narration-caption`); the AR HUD keeps it visible. */
  readonly caption: HTMLElement;
  update(state: NarrationViewState): void;
  dispose(): void;
}

/** Sound status line, in the Atom Builder's original wording. */
export function narrationStatusText(state: NarrationViewState): string {
  return state.audioError ?? (
    state.soundBlocked
      ? "Sound blocked. Tap to try again."
      : state.audioUnavailable
        ? "Captions remain available."
        : state.audioEnabled
          ? state.settings.muted ? "Sound muted" : "Sound enabled"
          : "Sound waits for your tap."
  );
}

/** Labels for headset panel buttons (sound, captions, replay), from the same state. */
export function narrationButtonLabels(state: Pick<NarrationViewState, "audioEnabled" | "settings">): {
  sound: string;
  captions: string;
  replay: string;
} {
  return {
    sound: !state.audioEnabled ? "Sound off" : state.settings.muted ? "Unmute" : "Mute",
    captions: state.settings.captionsEnabled ? "Captions on" : "Captions off",
    replay: "Replay",
  };
}

/** Create the shared narration bar. */
export function createNarrationBar(handlers: NarrationBarHandlers, doc: Document = document): NarrationBar {
  const element = doc.createElement("section");
  element.className = "narration-hud";
  element.setAttribute("aria-label", "Narration controls");
  element.innerHTML = `
    <p class="narration-caption" id="narration-caption" aria-live="polite" hidden></p>
    <div class="narration-controls">
      <button type="button" data-narration-action="enable">Tap to enable sound</button>
      <button type="button" data-narration-action="mute" aria-pressed="false">Mute</button>
      <button type="button" data-narration-action="replay">Replay last cue</button>
      <label>Speed
        <select id="narration-speed" aria-label="Narration speed">
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
        </select>
      </label>
      <button type="button" data-narration-action="captions" aria-pressed="true">Captions on</button>
      <span class="narration-audio-status" id="narration-audio-status" role="status"></span>
    </div>
  `;
  const find = <T extends HTMLElement>(selector: string): T => {
    const found = element.querySelector<T>(selector);
    if (!found) throw new Error(`Narration control ${selector} is missing.`);
    return found;
  };
  const caption = find<HTMLElement>("#narration-caption");
  const controls = find<HTMLElement>(".narration-controls");
  const speed = find<HTMLSelectElement>("#narration-speed");
  const enableButton = find<HTMLButtonElement>('[data-narration-action="enable"]');
  const muteButton = find<HTMLButtonElement>('[data-narration-action="mute"]');
  const captionsButton = find<HTMLButtonElement>('[data-narration-action="captions"]');
  const audioStatus = find<HTMLElement>("#narration-audio-status");

  const onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-narration-action]");
    switch (button?.dataset.narrationAction) {
      case "enable":
        handlers.enableSound();
        break;
      case "mute":
        handlers.toggleMuted();
        break;
      case "replay":
        handlers.replay();
        break;
      case "captions":
        handlers.toggleCaptions();
        break;
    }
  };
  const onSpeed = (): void => handlers.setSpeed(Number(speed.value) as NarrationSpeed);
  controls.addEventListener("click", onClick);
  speed.addEventListener("change", onSpeed);

  return {
    element,
    caption,
    update(state) {
      caption.textContent = state.captionText;
      caption.hidden = !state.settings.captionsEnabled || state.captionText.length === 0;
      enableButton.hidden = state.audioEnabled;
      enableButton.disabled = state.audioUnavailable;
      enableButton.textContent = state.audioUnavailable ? "Sound unavailable" : "Tap to enable sound";
      muteButton.textContent = state.settings.muted ? "Unmute" : "Mute";
      muteButton.setAttribute("aria-pressed", String(state.settings.muted));
      speed.value = String(state.settings.speed);
      captionsButton.textContent = state.settings.captionsEnabled ? "Captions on" : "Captions off";
      captionsButton.setAttribute("aria-pressed", String(state.settings.captionsEnabled));
      audioStatus.setAttribute("role", state.audioError ? "alert" : "status");
      audioStatus.textContent = narrationStatusText(state);
    },
    dispose() {
      controls.removeEventListener("click", onClick);
      speed.removeEventListener("change", onSpeed);
      element.remove();
      caption.remove();
    },
  };
}
