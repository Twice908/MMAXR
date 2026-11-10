import {
  createCosmos,
  createSoundscape,
  createSwitchPreference,
  createVeil,
  guessQuality,
  type Cosmos,
  type Soundscape,
  type Veil,
} from "@mma/engine-ambience";
import { LOGIN_MOOD, LOGIN_PALETTE } from "./theme.js";

/**
 * The persistent stage behind every page: the cosmos, the soundscape and the veil. It outlives
 * page changes, so the sky, the music and the colour carry on while pages swap in front of them.
 */
export interface Stage {
  readonly cosmos: Cosmos;
  readonly sound: Soundscape;
  readonly veil: Veil;
  readonly reducedMotion: boolean;
  /** A duration, shortened when the student prefers reduced motion. */
  time(ms: number): number;
  /** Show the cosmos (login, dashboard) or hand the screen to a lesson. */
  setCosmic(on: boolean): void;
  dispose(): void;
}

const SOUND_KEY = "mma.sound";

/** Build the stage and attach it to the page. */
export function createStage(doc: Document): Stage {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const hints = navigator as Navigator & { deviceMemory?: number };
  const quality = guessQuality({ cores: hints.hardwareConcurrency, memoryGb: hints.deviceMemory });

  const layer = doc.createElement("div");
  layer.className = "cosmos-layer";
  layer.setAttribute("aria-hidden", "true");
  // Hidden until a cosmic page (login, dashboard) asks for it, so it never covers a lesson.
  layer.hidden = true;
  doc.body.prepend(layer);
  const cosmos = createCosmos({ palette: LOGIN_PALETTE, quality, reducedMotion });
  layer.append(cosmos.element);
  if (!cosmos.supported) doc.body.classList.add("no-webgl");

  const preference = createSwitchPreference(readStorage(), SOUND_KEY, true);
  const sound = createSoundscape({
    enabled: preference.get(),
    mood: LOGIN_MOOD,
    onEnabledChange: (on) => preference.set(on),
  });
  const removeUnlock = sound.listenForUnlock(doc);
  const onVisibility = (): void => sound.setSuspended(doc.hidden);
  doc.addEventListener("visibilitychange", onVisibility);

  const veil = createVeil(doc.body, "#000000");

  return {
    cosmos,
    sound,
    veil,
    reducedMotion,
    time: (ms) => (reducedMotion ? Math.min(ms, 220) : ms),
    setCosmic(on) {
      doc.body.classList.toggle("is-cosmic", on);
      layer.hidden = !on;
      cosmos.setRunning(on);
    },
    dispose() {
      removeUnlock();
      doc.removeEventListener("visibilitychange", onVisibility);
      cosmos.dispose();
      sound.dispose();
      veil.dispose();
      layer.remove();
    },
  };
}

/** `localStorage`, or null where the browser blocks it. */
function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
