import type { NarrationSpeed, NarrationViewState } from "@mma/engine-voice";
import { el, setText } from "./dom.js";

/** What the narration controls do; the module connects them to its `NarrationPlayer`. */
export interface NarrationBarHandlers {
  readonly enableSound: () => void;
  readonly toggleMuted: () => void;
  readonly replay: () => void;
  readonly toggleCaptions: () => void;
  readonly setSpeed: (speed: NarrationSpeed) => void;
}

/** A mounted narration bar. The caption is separate so AR can keep it on screen. */
export interface NarrationBar {
  /** Live caption line (hidden when empty or captions are off). */
  readonly caption: HTMLElement;
  /** Sound, mute, replay, captions and speed controls. */
  readonly controls: HTMLElement;
  update(state: NarrationViewState): void;
  dispose(): void;
}

/** Short status line for the sound state, in plain words. */
export function narrationStatusText(state: NarrationViewState): string {
  if (state.audioError) return state.audioError;
  if (state.soundBlocked) return "Sound is blocked. Tap Turn on sound to try again.";
  if (state.audioUnavailable) return "Sound is not available. Captions still work.";
  if (!state.audioEnabled) return "Sound is off. Captions still show.";
  return state.settings.muted ? "Sound is muted." : "Sound is on.";
}

/** Labels for headset panel buttons (sound, captions, replay), from the same state. */
export function narrationButtonLabels(state: Pick<NarrationViewState, "audioEnabled" | "settings">): {
  sound: string;
  captions: string;
  replay: string;
} {
  return {
    sound: !state.audioEnabled ? "Sound on" : state.settings.muted ? "Unmute" : "Mute",
    captions: state.settings.captionsEnabled ? "Captions on" : "Captions off",
    replay: "Replay",
  };
}

/** Create the shared narration bar (screen mode and the phone AR HUD). */
export function createNarrationBar(handlers: NarrationBarHandlers, doc: Document = document): NarrationBar {
  const caption = el(doc, "p", "mma-narration__caption");
  caption.setAttribute("aria-live", "polite");
  caption.hidden = true;
  const controls = el(doc, "section", "mma-narration");
  controls.setAttribute("aria-label", "Narration");

  const button = (label: string, onClick: () => void, variant: "secondary" | "quiet", pressable = false): HTMLButtonElement => {
    const control = el(doc, "button", `mma-button mma-button--${variant}`, label);
    control.type = "button";
    if (pressable) control.setAttribute("aria-pressed", "false");
    control.addEventListener("click", onClick);
    return control;
  };
  const enable = button("Turn on sound", handlers.enableSound, "secondary");
  const mute = button("Mute", handlers.toggleMuted, "quiet", true);
  const replay = button("Replay", handlers.replay, "quiet");
  const captions = button("Captions on", handlers.toggleCaptions, "quiet", true);
  const speedLabel = el(doc, "label", "mma-narration__speed", "Speed");
  const speed = el(doc, "select", "mma-select");
  speed.setAttribute("aria-label", "Narration speed");
  for (const value of ["0.75", "1", "1.25"]) {
    const option = el(doc, "option", "", `${value}x`);
    option.value = value;
    speed.append(option);
  }
  speed.value = "1";
  const onSpeed = (): void => handlers.setSpeed(Number(speed.value) as NarrationSpeed);
  speed.addEventListener("change", onSpeed);
  speedLabel.append(speed);
  const status = el(doc, "span", "mma-narration__status");
  status.setAttribute("role", "status");
  const row = el(doc, "div", "mma-narration__controls");
  row.append(enable, mute, replay, captions, speedLabel);
  controls.append(row, status);

  return {
    caption,
    controls,
    update(state) {
      const showCaption = state.settings.captionsEnabled && state.captionText.length > 0;
      setText(caption, showCaption ? state.captionText : "");
      caption.hidden = !showCaption;
      enable.hidden = state.audioEnabled;
      enable.disabled = state.audioUnavailable;
      mute.hidden = !state.audioEnabled;
      setText(mute, state.settings.muted ? "Unmute" : "Mute");
      mute.setAttribute("aria-pressed", String(state.settings.muted));
      setText(captions, state.settings.captionsEnabled ? "Captions on" : "Captions off");
      captions.setAttribute("aria-pressed", String(state.settings.captionsEnabled));
      speed.value = String(state.settings.speed);
      setText(status, narrationStatusText(state));
      status.setAttribute("role", state.audioError ? "alert" : "status");
    },
    dispose() {
      speed.removeEventListener("change", onSpeed);
      caption.remove();
      controls.remove();
    },
  };
}
