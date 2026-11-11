import type { DeepReadonly } from "@mma/engine-core";
import type { LessonFlowState } from "./lesson-flow.js";

/** The parts of a mission lesson that mission moments react to. */
export interface MomentSnapshot {
  /** Index of the active mission, or -1 when none (free play or finished). */
  readonly missionIndex: number;
  /** Ids of completed missions. */
  readonly completed: readonly string[];
  /** Total Check presses that did not meet the goal, across missions. */
  readonly misses: number;
  readonly hints: number;
  readonly answered: number;
  readonly correct: number;
  readonly finished: boolean;
  /** Atom charge (protons minus electrons), for lessons that mark ions; 0 otherwise. */
  readonly charge: number;
}

/** A moment worth marking with light and sound. */
export type Moment =
  | { readonly kind: "mission-complete"; readonly missionId: string }
  | { readonly kind: "lesson-complete" }
  | { readonly kind: "answer"; readonly correct: boolean }
  | { readonly kind: "check-miss" }
  | { readonly kind: "hint" }
  | { readonly kind: "ion"; readonly charge: number };

/** Take a moment snapshot of a mission lesson. Pure. */
export function lessonMomentSnapshot(
  state: DeepReadonly<LessonFlowState>,
  missionIds: readonly string[],
  charge = 0,
): MomentSnapshot {
  const progress = Object.entries(state.missionProgress);
  const completed = progress.filter(([, item]) => item.status === "completed").map(([id]) => id);
  const attempts = progress.reduce((sum, [, item]) => sum + item.attempts, 0);
  return {
    missionIndex: state.activeMissionId === null ? -1 : missionIds.indexOf(state.activeMissionId),
    completed,
    misses: attempts - completed.length,
    hints: progress.reduce((sum, [, item]) => sum + item.hintsUsed, 0),
    answered: state.questionsAnswered,
    correct: state.questionsCorrect,
    finished: state.mode === "mission" && state.activeMissionId === null && completed.length === missionIds.length,
    charge,
  };
}

/**
 * Moments between two lesson snapshots, in the order they should play. View-only: the moments
 * celebrate what the lesson flow already decided and never change it.
 */
export function missionMoments(previous: MomentSnapshot, next: MomentSnapshot): readonly Moment[] {
  const moments: Moment[] = [];
  for (const missionId of next.completed) {
    if (!previous.completed.includes(missionId)) moments.push({ kind: "mission-complete", missionId });
  }
  if (next.finished && !previous.finished) moments.push({ kind: "lesson-complete" });
  if (next.answered > previous.answered) moments.push({ kind: "answer", correct: next.correct > previous.correct });
  if (next.misses > previous.misses) moments.push({ kind: "check-miss" });
  if (next.hints > previous.hints) moments.push({ kind: "hint" });
  if (next.charge !== 0 && Math.sign(next.charge) !== Math.sign(previous.charge)) {
    moments.push({ kind: "ion", charge: next.charge });
  }
  return moments;
}

/** The part of a soundscape moment sounds need (engine-ambience's soundscape fits). */
export interface MomentSoundPlayer {
  cue(name: "confirm" | "deny" | "open"): void;
  chord(midis: readonly number[], options?: { readonly spreadSeconds?: number; readonly gain?: number }): void;
  arrive(): void;
}

/** Notes of the mission-complete chord. */
export const MISSION_CHORD: readonly number[] = [79, 83, 86, 90, 93];
/** Notes of the chord for finishing every mission. */
export const LESSON_CHORD: readonly number[] = [67, 74, 79, 83, 86, 91, 95];

/**
 * Play a moment's sound: a landing and a chord for a finished mission (a longer chord for the
 * whole lesson), confirm or a soft "no" for answers, a soft "no" for a missed Check, a light chime
 * for a hint, and a two-note chime when an atom becomes an ion.
 */
export function playMomentSound(sound: MomentSoundPlayer, moment: Moment): void {
  switch (moment.kind) {
    case "mission-complete":
      sound.arrive();
      sound.chord(MISSION_CHORD, { spreadSeconds: 0.08, gain: 0.045 });
      return;
    case "lesson-complete":
      sound.arrive();
      sound.chord(LESSON_CHORD, { spreadSeconds: 0.11, gain: 0.05 });
      return;
    case "answer":
      sound.cue(moment.correct ? "confirm" : "deny");
      return;
    case "check-miss":
      sound.cue("deny");
      return;
    case "hint":
      sound.cue("open");
      return;
    case "ion":
      sound.chord(moment.charge > 0 ? [74, 81] : [69, 76], { spreadSeconds: 0.12, gain: 0.04 });
      return;
  }
}
