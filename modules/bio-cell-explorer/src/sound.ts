import type { SoundCue, SoundMood, Soundscape, SoundSweep } from "@mma/engine-ambience";
import type { JourneyMoment } from "@mma/engine-lesson";

/** One thing to play on the shared soundscape. */
export type SoundStep =
  | { readonly kind: "cue"; readonly name: SoundCue; readonly midi?: number }
  | { readonly kind: "chord"; readonly midis: readonly number[]; readonly spreadSeconds: number; readonly gain: number }
  | { readonly kind: "sweep"; readonly name: SoundSweep; readonly seconds: number }
  | { readonly kind: "arrive" };

/** Before the journey: an open, quiet chord, as in empty space. */
export const INTRO_MOOD: SoundMood = { rootMidi: 40, intervals: [0, 7, 14, 16, 21], brightness: 0.34 };

/** Each chapter has its own chord, getting brighter as the journey goes on. */
const CHAPTER_MOODS: Readonly<Record<string, SoundMood>> = {
  "two-cells": { rootMidi: 40, intervals: [0, 7, 14, 16, 21], brightness: 0.42 },
  mitochondria: { rootMidi: 45, intervals: [0, 7, 12, 16, 19], brightness: 0.48 },
  chloroplasts: { rootMidi: 43, intervals: [0, 7, 14, 18, 21], brightness: 0.54 },
  recap: { rootMidi: 47, intervals: [0, 4, 7, 11, 14], brightness: 0.6 },
};

/** The whole journey done: a resolved, bright chord. */
export const FINISHED_MOOD: SoundMood = { rootMidi: 40, intervals: [0, 7, 12, 16, 19], brightness: 0.64 };

/** The pad chord for a chapter id; unknown chapters keep the intro chord. */
export function chapterMood(chapterId: string | null): SoundMood {
  return (chapterId ? CHAPTER_MOODS[chapterId] : undefined) ?? INTRO_MOOD;
}

/**
 * What a journey moment sounds like. Every sound repeats something already shown on screen,
 * so nothing is lost when sound is off.
 */
export function momentSounds(moment: JourneyMoment): readonly SoundStep[] {
  switch (moment.kind) {
    case "chapter-start":
      // The first chapter starts with the fly-in, which has its own sweep and landing.
      return moment.chapterIndex === 0 ? [] : [{ kind: "chord", midis: [72, 76, 79], spreadSeconds: 0.12, gain: 0.03 }];
    case "checkpoint":
      return [{ kind: "chord", midis: [79, 84], spreadSeconds: 0.1, gain: 0.032 }];
    case "wrong":
      return [{ kind: "cue", name: "deny" }];
    case "solved":
      return [{ kind: "cue", name: "confirm" }];
    case "hint":
      return [{ kind: "cue", name: "open" }];
    case "answer":
      return [{ kind: "cue", name: moment.correct ? "confirm" : "deny" }];
    case "chapter-complete":
      return [{ kind: "arrive" }, { kind: "chord", midis: [79, 83, 86, 91], spreadSeconds: 0.08, gain: 0.045 }];
    case "journey-complete":
      return [{ kind: "arrive" }, { kind: "chord", midis: [67, 74, 79, 83, 86, 91, 95], spreadSeconds: 0.11, gain: 0.05 }];
  }
}

/** The fly-in from empty space when the journey starts: a dive, then a soft landing. */
export const FLY_IN_SOUND: readonly SoundStep[] = [{ kind: "sweep", name: "dive", seconds: 1.8 }];
export const LANDING_SOUND: readonly SoundStep[] = [{ kind: "arrive" }];
/** Tapping a structure to see its name. */
export const EXPLORE_SOUND: readonly SoundStep[] = [{ kind: "cue", name: "select" }];

/** Play steps on the soundscape, if there is one. */
export function playSteps(sound: Soundscape | undefined, steps: readonly SoundStep[]): void {
  if (!sound) return;
  for (const step of steps) {
    switch (step.kind) {
      case "cue":
        sound.cue(step.name, step.midi === undefined ? {} : { midi: step.midi });
        break;
      case "chord":
        sound.chord(step.midis, { spreadSeconds: step.spreadSeconds, gain: step.gain });
        break;
      case "sweep":
        sound.sweep(step.name, step.seconds);
        break;
      case "arrive":
        sound.arrive();
        break;
    }
  }
}
