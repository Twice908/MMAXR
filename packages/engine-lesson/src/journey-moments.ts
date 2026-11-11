import type { DeepReadonly } from "@mma/engine-core";
import type { JourneyFlowState, JourneyStatus } from "./journey-flow.js";

/** The parts of a journey that moments react to. Plain data, built by {@link journeySnapshot}. */
export interface JourneySnapshot {
  readonly status: JourneyStatus;
  readonly chapterIndex: number;
  /** Ids of completed chapter missions. */
  readonly completed: readonly string[];
  /** Wrong checkpoint answers in the current chapter. */
  readonly misses: number;
  /** Hints used across all chapters. */
  readonly hints: number;
  readonly answered: number;
  readonly correct: number;
}

/** A moment worth marking with light and sound. */
export type JourneyMoment =
  /** A chapter's first beat started (also when a chapter is replayed or jumped to). */
  | { readonly kind: "chapter-start"; readonly chapterIndex: number }
  /** A checkpoint is waiting for an answer. */
  | { readonly kind: "checkpoint" }
  | { readonly kind: "wrong" }
  | { readonly kind: "solved" }
  | { readonly kind: "hint" }
  /** A scored question was answered. */
  | { readonly kind: "answer"; readonly correct: boolean }
  /** A chapter's mission was completed for the first time. */
  | { readonly kind: "chapter-complete"; readonly chapterIndex: number; readonly missionId: string }
  | { readonly kind: "journey-complete" };

/** Take a snapshot of a journey state for {@link journeyMoments}. */
export function journeySnapshot(state: DeepReadonly<JourneyFlowState>): JourneySnapshot {
  const progress = Object.entries(state.missionProgress);
  return {
    status: state.journey.status,
    chapterIndex: state.journey.chapterIndex,
    completed: progress.filter(([, item]) => item.status === "completed").map(([id]) => id),
    misses: state.journey.checkpointMisses,
    hints: progress.reduce((sum, [, item]) => sum + item.hintsUsed, 0),
    answered: state.questionsAnswered,
    correct: state.questionsCorrect,
  };
}

/**
 * Moments between two journey snapshots, in the order they should play. View-only: moments
 * mark what the journey already decided and never change it. `missionIds` are the chapters'
 * mission ids, in chapter order.
 */
export function journeyMoments(previous: JourneySnapshot, next: JourneySnapshot, missionIds: readonly string[]): readonly JourneyMoment[] {
  const moments: JourneyMoment[] = [];
  const newChapter = next.status === "beats" && (previous.status !== "beats" || previous.chapterIndex !== next.chapterIndex);
  // Resuming the same chapter's beats after a pause is not a new start; replaying is.
  if (newChapter) moments.push({ kind: "chapter-start", chapterIndex: next.chapterIndex });
  if (next.status === "checkpoint" && previous.status !== "checkpoint") moments.push({ kind: "checkpoint" });
  if (next.status === "checkpoint" && next.misses > previous.misses) moments.push({ kind: "wrong" });
  if (next.status === "solved" && previous.status !== "solved") moments.push({ kind: "solved" });
  if (next.hints > previous.hints) moments.push({ kind: "hint" });
  if (next.answered > previous.answered) moments.push({ kind: "answer", correct: next.correct > previous.correct });
  for (const missionId of next.completed) {
    if (previous.completed.includes(missionId)) continue;
    const chapterIndex = missionIds.indexOf(missionId);
    if (chapterIndex >= 0) moments.push({ kind: "chapter-complete", chapterIndex, missionId });
  }
  if (next.status === "finished" && previous.status !== "finished") moments.push({ kind: "journey-complete" });
  return moments;
}
