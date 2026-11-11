import type {
  DeepReadonly,
  EngineAction,
  LearningEventDraft,
  MissionDefinition,
  MissionProgress,
} from "@mma/engine-core";
import type { JourneyChapter, JourneyDefinition } from "@mma/schema";
import {
  LESSON_FLOW_ACTION,
  createLessonFlowReducer,
  createLessonFlowState,
  projectLessonFlowEvents,
  type LessonFlowState,
} from "./lesson-flow.js";

/**
 * Where the student is in a journey:
 * - `intro`: before Play is pressed;
 * - `beats`: narrated beats of the current chapter are playing (or paused);
 * - `checkpoint`: the chapter's question is waiting for an answer;
 * - `solved`: the checkpoint was answered; the explanation shows until Continue;
 * - `questions`: scored questions linked to the chapter's mission are showing;
 * - `finished`: every chapter is done.
 */
export type JourneyStatus = "intro" | "beats" | "checkpoint" | "solved" | "questions" | "finished";

/** The latest answer to the current checkpoint. */
export interface JourneyAnswer {
  /** Tap target or option id. */
  readonly value: string;
  readonly correct: boolean;
}

/** Plain, serializable journey position. */
export interface JourneyState {
  readonly status: JourneyStatus;
  readonly paused: boolean;
  readonly chapterIndex: number;
  readonly beatIndex: number;
  /** Highest chapter index the student may jump to. */
  readonly unlockedChapterIndex: number;
  /** Wrong answers given to the current checkpoint. */
  readonly checkpointMisses: number;
  readonly lastAnswer: JourneyAnswer | null;
}

/** Lesson fields plus the journey position. A module adds its own fields beside them. */
export interface JourneyFlowState extends LessonFlowState {
  readonly journey: JourneyState;
}

/** Journey action types; lesson-flow actions (scored questions, hints) pass through too. */
export const JOURNEY_ACTION = {
  play: "journey/play",
  pause: "journey/pause",
  /** The page reports that a beat finished (narration ended or its time ran out). */
  beatEnded: "journey/beat-ended",
  skip: "journey/skip",
  replayChapter: "journey/replay-chapter",
  goToChapter: "journey/go-to-chapter",
  answer: "journey/answer",
  hint: "journey/hint",
  continue: "journey/continue",
} as const;

const journeyActionTypes: ReadonlySet<string> = new Set(Object.values(JOURNEY_ACTION));

/** Return true when the journey reducer handles this action itself. */
export function isJourneyAction(action: Readonly<EngineAction>): boolean {
  return journeyActionTypes.has(action.type);
}

/** Create the journey and lesson fields: nothing started, before Play. */
export function createJourneyFlowState(missions: readonly MissionDefinition[]): JourneyFlowState {
  return {
    ...createLessonFlowState(missions),
    journey: {
      status: "intro",
      paused: false,
      chapterIndex: 0,
      beatIndex: 0,
      unlockedChapterIndex: 0,
      checkpointMisses: 0,
      lastAnswer: null,
    },
  };
}

/** Pure reducer for journey and lesson actions; keeps the module's own fields. */
export type JourneyFlowReducer = <State extends JourneyFlowState>(
  state: DeepReadonly<State>,
  action: Readonly<EngineAction>,
) => State;

/**
 * Create the reducer for a journey. Each chapter is tracked as a mission (goal
 * `{ chapter: <id> }`): starting a chapter starts the mission and solving its checkpoint
 * (or finishing its beats, when it has none) completes it. Checkpoint answers are not
 * scored; a mission's linked assessment items are the scored questions, shown before
 * the next chapter.
 */
export function createJourneyFlowReducer(
  journey: JourneyDefinition,
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
): JourneyFlowReducer {
  const lesson = createLessonFlowReducer(missions, rawAssessmentItems);
  const chapters = journey.chapters;

  const startChapter = (state: DeepReadonly<JourneyFlowState>, chapterIndex: number): DeepReadonly<JourneyFlowState> => {
    const chapter = chapters[chapterIndex];
    if (!chapter) return finish(state);
    const started = lesson(
      { ...state, activeMissionId: null },
      { type: LESSON_FLOW_ACTION.startMission, payload: { missionId: chapter.missionId } },
    );
    return {
      ...started,
      // Replaying an earlier chapter keeps the furthest chapter's mission active.
      activeMissionId: started.missionProgress[chapter.missionId]?.status === "active" ? chapter.missionId : null,
      journey: {
        ...state.journey,
        status: "beats",
        paused: false,
        chapterIndex,
        beatIndex: 0,
        unlockedChapterIndex: Math.max(state.journey.unlockedChapterIndex, chapterIndex),
        checkpointMisses: 0,
        lastAnswer: null,
      },
    };
  };

  const finish = (state: DeepReadonly<JourneyFlowState>): DeepReadonly<JourneyFlowState> => ({
    ...state,
    activeMissionId: null,
    journey: { ...state.journey, status: "finished", paused: false, beatIndex: 0, lastAnswer: null },
  });

  /** Mark the chapter's mission done and move to its questions, its explanation, or the next chapter. */
  const completeChapter = (
    state: DeepReadonly<JourneyFlowState>,
    chapter: JourneyChapter,
    then: "solved" | "next",
  ): DeepReadonly<JourneyFlowState> => {
    let next = state;
    if (state.missionProgress[chapter.missionId]?.status === "active") {
      next = lesson(
        { ...state, activeMissionId: chapter.missionId },
        { type: LESSON_FLOW_ACTION.checkMission, payload: { state: { chapter: chapter.id } } },
      );
    }
    const unlocked = Math.max(next.journey.unlockedChapterIndex, Math.min(next.journey.chapterIndex + 1, chapters.length - 1));
    next = { ...next, journey: { ...next.journey, unlockedChapterIndex: unlocked } };
    if (next.assessmentIds.length > 0 && next.currentAnswer === null && then === "next") {
      return { ...next, journey: { ...next.journey, status: "questions" } };
    }
    if (then === "solved") return { ...next, journey: { ...next.journey, status: "solved" } };
    return startChapter(next, next.journey.chapterIndex + 1);
  };

  const endBeat = (state: DeepReadonly<JourneyFlowState>): DeepReadonly<JourneyFlowState> => {
    const chapter = chapters[state.journey.chapterIndex];
    if (!chapter || state.journey.status !== "beats") return state;
    if (state.journey.beatIndex + 1 < chapter.beats.length) {
      return { ...state, journey: { ...state.journey, beatIndex: state.journey.beatIndex + 1 } };
    }
    if (chapter.checkpoint) {
      return { ...state, journey: { ...state.journey, status: "checkpoint", paused: false } };
    }
    return completeChapter(state, chapter, "next");
  };

  const reduce = (state: DeepReadonly<JourneyFlowState>, action: Readonly<EngineAction>): DeepReadonly<JourneyFlowState> => {
    const position = state.journey;
    const chapter = chapters[position.chapterIndex];
    switch (action.type) {
      case JOURNEY_ACTION.play:
        if (position.status === "intro") return startChapter(state, 0);
        return position.paused ? { ...state, journey: { ...position, paused: false } } : state;
      case JOURNEY_ACTION.pause:
        return position.status === "beats" && !position.paused ? { ...state, journey: { ...position, paused: true } } : state;
      case JOURNEY_ACTION.beatEnded: {
        // Ignore late reports from a beat that is no longer playing.
        const beatId = stringProperty(action.payload, "beatId");
        if (position.paused || !chapter || chapter.beats[position.beatIndex]?.id !== beatId) return state;
        return endBeat(state);
      }
      case JOURNEY_ACTION.skip:
        return endBeat(state);
      case JOURNEY_ACTION.replayChapter:
        return position.status === "intro" || position.status === "questions" ? state : startChapter(state, position.chapterIndex);
      case JOURNEY_ACTION.goToChapter: {
        const target = numberProperty(action.payload, "chapterIndex");
        if (target === undefined || !Number.isInteger(target) || target < 0 || target > position.unlockedChapterIndex) return state;
        if (position.status === "intro" || position.status === "questions") return state;
        return startChapter(state, target);
      }
      case JOURNEY_ACTION.answer: {
        const value = stringProperty(action.payload, "value");
        const checkpoint = chapter?.checkpoint;
        if (!chapter || !checkpoint || position.status !== "checkpoint" || value === undefined) return state;
        const correct = checkpoint.kind === "tap" ? checkpoint.correctTargets.includes(value) : checkpoint.correctOptionId === value;
        const answered = { ...state, journey: { ...position, lastAnswer: { value, correct } } };
        if (!correct) {
          // Count the attempt on the chapter's mission (it stays active) without scoring it.
          const counted = state.missionProgress[chapter.missionId]?.status === "active"
            ? lesson(
              { ...answered, activeMissionId: chapter.missionId },
              { type: LESSON_FLOW_ACTION.checkMission, payload: { state: { chapter: "" } } },
            )
            : answered;
          return { ...counted, journey: { ...answered.journey, checkpointMisses: position.checkpointMisses + 1 } };
        }
        return completeChapter(answered, chapter, "solved");
      }
      case JOURNEY_ACTION.hint:
        return position.status === "checkpoint" && chapter && state.missionProgress[chapter.missionId]?.status === "active"
          ? lesson({ ...state, activeMissionId: chapter.missionId }, { type: LESSON_FLOW_ACTION.hint, payload: null })
          : state;
      case JOURNEY_ACTION.continue: {
        if (position.status !== "solved" || !chapter) return state;
        if (state.assessmentIds.length > 0) return { ...state, journey: { ...position, status: "questions", lastAnswer: null } };
        return startChapter(state, position.chapterIndex + 1);
      }
      default: {
        // Only the scored questions pass through; chapters start and finish missions themselves.
        if (action.type !== LESSON_FLOW_ACTION.answer && action.type !== LESSON_FLOW_ACTION.continue) return state;
        if (position.status !== "questions") return state;
        const next = lesson(state, action);
        // Leaving the scored questions moves on to the next chapter.
        if (next.assessmentIds.length === 0) {
          return startChapter(next, position.chapterIndex + 1);
        }
        return next;
      }
    }
  };

  return <State extends JourneyFlowState>(state: DeepReadonly<State>, action: Readonly<EngineAction>): State =>
    reduce(state as DeepReadonly<JourneyFlowState>, action) as unknown as State;
}

/**
 * Project a journey or lesson action to learning telemetry. Mission starts, completions
 * and hints come from changes in mission progress, so they are reported however the
 * journey reached them; scored answers come from the lesson flow.
 */
export function projectJourneyFlowEvents(
  missions: readonly MissionDefinition[],
  action: Readonly<EngineAction>,
  previous: DeepReadonly<JourneyFlowState>,
  next: DeepReadonly<JourneyFlowState>,
): readonly LearningEventDraft[] {
  if (action.type === LESSON_FLOW_ACTION.answer) return projectLessonFlowEvents(missions, action, previous, next);
  const events: LearningEventDraft[] = [];
  for (const mission of missions) {
    const before: DeepReadonly<MissionProgress> | undefined = previous.missionProgress[mission.id];
    const after: DeepReadonly<MissionProgress> | undefined = next.missionProgress[mission.id];
    if (!before || !after || before === after) continue;
    if (before.status === "not_started" && after.status === "active") {
      events.push({ type: "mission_started", payload: { missionId: mission.id } });
    }
    if (after.hintsUsed > before.hintsUsed) {
      const levels = ["nudge", "clue", "explanation"] as const;
      events.push({
        type: "hint_used",
        payload: { missionId: mission.id, hintLevel: levels[Math.min(before.hintsUsed, 2)] ?? "explanation", hintIndex: before.hintsUsed },
      });
    }
    if (before.status !== "completed" && after.status === "completed") {
      const assessmentIds = mission.onComplete?.triggerAssessments;
      events.push({
        type: "mission_completed",
        payload: {
          missionId: mission.id,
          attempts: after.attempts,
          hintsUsed: after.hintsUsed,
          ...(assessmentIds ? { assessmentIds } : {}),
        },
      });
    }
  }
  return events;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" ? property : undefined;
}
