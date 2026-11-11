import { createJourneyCaptions, moodNotes, type KeyValueStorage } from "@mma/engine-ambience";
import type { Stage } from "./stage.js";
import type { ArrivalScript } from "./theme.js";

/** Length of the first-visit descent. */
export const FULL_ARRIVAL_MS = 5600;
/** Length of the descent on later visits. */
export const SHORT_ARRIVAL_MS = 2300;
/** Later visits start among the packed particles, skipping the clouds. */
export const SHORT_ARRIVAL_FROM = 0.5;
/** Progress at which the atom has settled. */
const SETTLED = 0.9;

/** Which descents a student has already seen on this device. */
export interface ArrivalLog {
  seen(studentRef: string, moduleId: string): boolean;
  mark(studentRef: string, moduleId: string): void;
}

/**
 * Remember first visits per student and module, so the full descent plays once and later visits
 * get the short one. Storage errors fall back to remembering for this visit only.
 */
export function createArrivalLog(storage: KeyValueStorage | null): ArrivalLog {
  const memory = new Set<string>();
  const key = (studentRef: string, moduleId: string): string => `mma.arrival.v1.${studentRef}.${moduleId}`;
  return {
    seen(studentRef, moduleId) {
      const name = key(studentRef, moduleId);
      if (memory.has(name)) return true;
      try {
        return storage?.getItem(name) === "seen";
      } catch {
        return false;
      }
    },
    mark(studentRef, moduleId) {
      const name = key(studentRef, moduleId);
      memory.add(name);
      try {
        storage?.setItem(name, "seen");
      } catch {
        // Remembered for this visit only.
      }
    },
  };
}

/** The status line to show at a point of the descent. */
export function captionFor(script: ArrivalScript, progress: number, short: boolean): string {
  if (progress >= SETTLED) return short ? script.welcomeBack : script.welcome;
  const lines = short ? script.shortLines : script.lines;
  if (lines.length === 0) return "";
  const from = short ? SHORT_ARRIVAL_FROM : 0;
  const span = (SETTLED - from) / lines.length;
  const index = Math.min(lines.length - 1, Math.max(0, Math.floor((progress - from) / span)));
  return lines[index] ?? "";
}

/** One sound moment in the descent. */
export type ArrivalCue =
  | { readonly at: number; readonly kind: "select" | "hover"; readonly midi: number; readonly pan: number }
  | { readonly at: number; readonly kind: "dive"; readonly seconds: number }
  | { readonly at: number; readonly kind: "arrive" };

/**
 * The score of the descent, by progress: a chime as the clouds break, a rising run of bells as
 * the scales shrink past (pitch climbs as size falls), a rush towards the atom, and a landing.
 */
export function arrivalCues(script: ArrivalScript, short: boolean): readonly ArrivalCue[] {
  const from = short ? SHORT_ARRIVAL_FROM : 0;
  const notes = moodNotes(script.mood);
  const cues: ArrivalCue[] = [];
  if (!short) cues.push({ at: 0.25, kind: "select", midi: script.note, pan: 0 });
  for (let step = 0; step < 8; step += 1) {
    const at = 0.3 + step * 0.055;
    if (at <= from) continue;
    const note = notes[step % notes.length] ?? script.mood.rootMidi;
    cues.push({ at, kind: "hover", midi: note + 24 + (step >= notes.length ? 12 : 0), pan: step % 2 === 0 ? -0.5 : 0.5 });
  }
  cues.push({ at: 0.7, kind: "dive", seconds: short ? 0.7 : 1.1 });
  cues.push({ at: SETTLED, kind: "arrive" });
  return cues;
}

/** A playing descent. */
export interface ArrivalRun {
  /** Resolves when the descent reaches the atom (or a skip finishes). */
  readonly arrived: Promise<void>;
  /** Fade the descent away to reveal what is underneath. */
  finish(fadeMs: number): Promise<void>;
}

/** Play the descent for a module over everything, with captions and music. */
export function playArrival(
  stage: Stage,
  script: ArrivalScript,
  options: { readonly short: boolean; readonly title: string },
): ArrivalRun {
  const { sound, cosmos } = stage;
  const short = options.short;
  const from = short ? SHORT_ARRIVAL_FROM : 0;
  const cues = arrivalCues(script, short);
  let skipped = false;
  let last = from - 1e-6;
  let waitTimer = 0;

  stage.beginJourney();
  sound.setMood(script.mood, 1.2);
  sound.setBedLevel(0.85, 1.2);
  sound.sweep("warp", short ? 0.9 : 1.4);

  const captions = createJourneyCaptions(document.body, {
    title: options.title,
    accent: script.palette.accent,
    onSkip: () => {
      skipped = true;
      journey.skip();
    },
  });
  captions.setLine(captionFor(script, from, short));

  const journey = cosmos.startJourney({
    palette: script.palette,
    shellColor: script.shellColor,
    nucleusColor: script.nucleusColor,
    shells: script.shells,
    durationMs: short ? SHORT_ARRIVAL_MS / (1 - SHORT_ARRIVAL_FROM) : FULL_ARRIVAL_MS,
    from,
    onProgress: (progress) => {
      captions.setLine(captionFor(script, progress, short));
      captions.setProgress((progress - from) / Math.max(1e-6, 1 - from));
      for (const cue of cues) {
        if (cue.at <= last || cue.at > progress) continue;
        // A skip races through the descent: keep only the landing.
        if (skipped && cue.kind !== "arrive") continue;
        if (cue.kind === "arrive") sound.arrive();
        else if (cue.kind === "dive") sound.sweep("dive", cue.seconds);
        else sound.cue(cue.kind, { midi: cue.midi, pan: cue.pan });
      }
      last = progress;
    },
  });

  const arrived = journey.arrived.then(() => {
    captions.hideSkip();
    waitTimer = window.setTimeout(() => captions.setLine(script.waiting), 1400);
  });

  return {
    arrived,
    async finish(fadeMs) {
      window.clearTimeout(waitTimer);
      sound.setBedLevel(0, 2.5);
      await Promise.all([captions.finish(Math.round(fadeMs * 0.7)), stage.endJourney(fadeMs)]);
      journey.stop();
    },
  };
}
