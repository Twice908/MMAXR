import type { ModuleManifest } from "@mma/schema";
import type { LearningEventDraft } from "./events.js";

/** The manifest-backed data needed to evaluate a mission. */
export type MissionDefinition = ModuleManifest["missions"][number];

/** Lifecycle state maintained by the caller's serializable application state. */
export type MissionStatus = "not_started" | "active" | "completed" | "failed";

/** Plain-data counters and status for one mission. */
export interface MissionProgress {
  readonly status: MissionStatus;
  readonly attempts: number;
  readonly hintsUsed: number;
}

/** A pure mission transition and any associated event, hint, or assessment result. */
export interface MissionTransition {
  readonly progress: MissionProgress;
  readonly event?: LearningEventDraft;
  readonly hint?: {
    readonly level: "nudge" | "clue" | "explanation";
    readonly index: number;
    readonly text: string;
  };
  readonly assessmentIds?: readonly string[];
}

/** Create the initial serializable state for a mission. */
export function createMissionProgress(): MissionProgress {
  return { status: "not_started", attempts: 0, hintsUsed: 0 };
}

/** Start a mission once; later starts do not reset its progress. */
export function startMission(
  mission: MissionDefinition,
  progress: MissionProgress = createMissionProgress(),
): MissionTransition {
  if (progress.status !== "not_started") {
    return { progress };
  }

  return {
    progress: { ...progress, status: "active" },
    event: { type: "mission_started", payload: { missionId: mission.id } },
  };
}

/**
 * Count one explicit check. A wrong state leaves the mission active so the learner can
 * experiment; only a matching goal completes it. A linked assessment ID is returned
 * and included in the completion event.
 */
export function evaluateMission(
  mission: MissionDefinition,
  state: unknown,
  progress: MissionProgress,
): MissionTransition {
  if (progress.status !== "active") {
    return { progress };
  }

  const attempts = progress.attempts + 1;
  if (!matchesGoal(state, mission.goal)) {
    return { progress: { ...progress, attempts } };
  }

  const assessmentIds = mission.onComplete?.triggerAssessments;
  const payload = {
    missionId: mission.id,
    attempts,
    hintsUsed: progress.hintsUsed,
    ...(assessmentIds ? { assessmentIds } : {}),
  };

  return {
    progress: { ...progress, status: "completed", attempts },
    event: { type: "mission_completed", payload },
    ...(assessmentIds ? { assessmentIds } : {}),
  };
}

/**
 * Return the next hint in order. Hint requests advance nudge -> clue -> explanation;
 * exhausted hints and inactive missions leave progress unchanged.
 */
export function requestMissionHint(
  mission: MissionDefinition,
  progress: MissionProgress,
): MissionTransition {
  if (progress.status !== "active") {
    return { progress };
  }

  const index = progress.hintsUsed;
  const text = mission.hints[index];
  if (text === undefined) {
    return { progress };
  }

  const levels = ["nudge", "clue", "explanation"] as const;
  const level = levels[Math.min(index, levels.length - 1)] ?? "explanation";

  return {
    progress: { ...progress, hintsUsed: progress.hintsUsed + 1 },
    hint: { level, index, text },
    event: {
      type: "hint_used",
      payload: { missionId: mission.id, hintLevel: level, hintIndex: index },
    },
  };
}

/**
 * Fail an active mission only after an explicit give-up or module-limit transition.
 * Incorrect evaluations never fail a mission automatically.
 */
export function failMission(
  mission: MissionDefinition,
  progress: MissionProgress,
  reason: "give_up" | "limit_reached",
): MissionTransition {
  if (progress.status !== "active") {
    return { progress };
  }

  return {
    progress: { ...progress, status: "failed" },
    event: {
      type: "mission_failed",
      payload: {
        missionId: mission.id,
        attempts: progress.attempts,
        hintsUsed: progress.hintsUsed,
        reason,
      },
    },
  };
}

function matchesGoal(state: unknown, goal: Readonly<Record<string, unknown>>): boolean {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return false;
  }

  return Object.entries(goal).every(
    ([key, expected]) =>
      Object.hasOwn(state, key) && jsonEqual((state as Record<string, unknown>)[key], expected),
  );
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  const leftEntries = Object.entries(left);
  const rightRecord = right as Record<string, unknown>;
  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(
      ([key, value]) => Object.hasOwn(rightRecord, key) && jsonEqual(value, rightRecord[key]),
    )
  );
}
