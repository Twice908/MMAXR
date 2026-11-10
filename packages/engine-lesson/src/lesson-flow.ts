import {
  createMissionProgress,
  evaluateMission,
  requestMissionHint,
  startMission,
  type DeepReadonly,
  type EngineAction,
  type LearningEventDraft,
  type MissionDefinition,
  type MissionProgress,
} from "@mma/engine-core";
import { assessmentItemSchema, scoreAssessmentAnswer } from "@mma/engine-assess";

/**
 * Subject-neutral lesson state: which mission is active, its progress, and the
 * check questions it triggered. A module adds its own subject state beside these
 * fields (for example `chemistry`), so one lesson flow serves every module.
 */
export interface LessonFlowState {
  readonly mode: "mission" | "free-play";
  readonly activeMissionId: string | null;
  readonly missionProgress: Readonly<Record<string, MissionProgress>>;
  readonly assessmentIds: readonly string[];
  readonly assessmentIndex: number;
  readonly currentAnswer: {
    readonly assessmentId: string;
    readonly selectedOptionIndex: number;
    readonly correct: boolean;
  } | null;
  readonly questionsAnswered: number;
  readonly questionsCorrect: number;
}

/** Action types handled by the lesson flow; every other action belongs to the module. */
export const LESSON_FLOW_ACTION = {
  startMission: "mission/start",
  checkMission: "mission/check",
  hint: "mission/hint",
  freePlay: "mode/free-play",
  answer: "assessment/answer",
  continue: "assessment/continue",
} as const;

const lessonFlowActionTypes: ReadonlySet<string> = new Set(Object.values(LESSON_FLOW_ACTION));

/** Return true when the lesson flow, not the module's subject reducer, owns this action. */
export function isLessonFlowAction(action: Readonly<EngineAction>): boolean {
  return lessonFlowActionTypes.has(action.type);
}

/** Create the lesson fields with every mission not started and no mission active. */
export function createLessonFlowState(missions: readonly MissionDefinition[]): LessonFlowState {
  return {
    mode: "mission",
    activeMissionId: null,
    missionProgress: Object.fromEntries(missions.map((mission) => [mission.id, createMissionProgress()])),
    assessmentIds: [],
    assessmentIndex: 0,
    currentAnswer: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
  };
}

/**
 * A pure reducer for lesson actions. It keeps every other field of the state it is
 * given (the module's subject state), and returns the same object when nothing changes.
 */
export type LessonFlowReducer = <State extends LessonFlowState>(
  state: DeepReadonly<State>,
  action: Readonly<EngineAction>,
) => State;

/**
 * Create the lesson reducer for a module's missions and assessment items. Mission
 * checks compare `payload.state` (a flat record the module builds) with the mission goal.
 */
export function createLessonFlowReducer(
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
): LessonFlowReducer {
  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  const assessmentItems = rawAssessmentItems.map((item) => assessmentItemSchema.parse(item));
  const assessmentsById = new Map(assessmentItems.map((item) => [item.id, item]));

  const reduce = (state: DeepReadonly<LessonFlowState>, action: Readonly<EngineAction>): DeepReadonly<LessonFlowState> => {
    switch (action.type) {
      case LESSON_FLOW_ACTION.startMission: {
        const missionId = stringProperty(action.payload, "missionId");
        const mission = missionId ? missionsById.get(missionId) : undefined;
        if (!mission || state.mode !== "mission") {
          return state;
        }
        const progress = state.missionProgress[mission.id] ?? createMissionProgress();
        const transition = startMission(mission, progress);
        return {
          ...state,
          activeMissionId: transition.progress.status === "active" ? mission.id : state.activeMissionId,
          missionProgress: { ...state.missionProgress, [mission.id]: transition.progress },
        };
      }
      case LESSON_FLOW_ACTION.checkMission: {
        const mission = state.activeMissionId ? missionsById.get(state.activeMissionId) : undefined;
        const progress = mission ? state.missionProgress[mission.id] : undefined;
        const goalState = recordProperty(action.payload, "state");
        if (!mission || !progress || !isRecord(goalState)) {
          return state;
        }
        const transition = evaluateMission(mission, goalState, progress);
        return {
          ...state,
          missionProgress: { ...state.missionProgress, [mission.id]: transition.progress },
          ...(transition.assessmentIds
            ? { assessmentIds: transition.assessmentIds, assessmentIndex: 0, currentAnswer: null }
            : {}),
        };
      }
      case LESSON_FLOW_ACTION.hint: {
        const mission = state.activeMissionId ? missionsById.get(state.activeMissionId) : undefined;
        const progress = mission ? state.missionProgress[mission.id] : undefined;
        if (!mission || !progress) {
          return state;
        }
        const transition = requestMissionHint(mission, progress);
        return {
          ...state,
          missionProgress: { ...state.missionProgress, [mission.id]: transition.progress },
        };
      }
      case LESSON_FLOW_ACTION.freePlay:
        return {
          ...state,
          mode: "free-play",
          activeMissionId: null,
          assessmentIds: [],
          assessmentIndex: 0,
          currentAnswer: null,
        };
      case LESSON_FLOW_ACTION.answer: {
        const assessmentId = state.assessmentIds[state.assessmentIndex];
        const item = assessmentId ? assessmentsById.get(assessmentId) : undefined;
        const selectedOptionIndex = numberProperty(action.payload, "selectedOptionIndex");
        if (!item || state.currentAnswer || selectedOptionIndex === undefined) {
          return state;
        }
        const result = scoreAssessmentAnswer(item, selectedOptionIndex);
        return {
          ...state,
          currentAnswer: {
            assessmentId: item.id,
            selectedOptionIndex,
            correct: result.correct,
          },
          questionsAnswered: state.questionsAnswered + 1,
          questionsCorrect: state.questionsCorrect + Number(result.correct),
        };
      }
      case LESSON_FLOW_ACTION.continue: {
        if (!state.currentAnswer) {
          return state;
        }
        const nextIndex = state.assessmentIndex + 1;
        if (nextIndex < state.assessmentIds.length) {
          return { ...state, assessmentIndex: nextIndex, currentAnswer: null };
        }
        return startNextMission(state, missions);
      }
      default:
        return state;
    }
  };

  // The spread copies keep the module's own fields, so the result has the caller's type.
  return <State extends LessonFlowState>(state: DeepReadonly<State>, action: Readonly<EngineAction>): State =>
    reduce(state as DeepReadonly<LessonFlowState>, action) as unknown as State;
}

/** Project dispatched lesson actions to typed learning telemetry drafts. */
export function projectLessonFlowEvents(
  missions: readonly MissionDefinition[],
  action: Readonly<EngineAction>,
  previousState: DeepReadonly<LessonFlowState>,
  nextState: DeepReadonly<LessonFlowState>,
): readonly LearningEventDraft[] {
  if (action.type === LESSON_FLOW_ACTION.startMission || action.type === LESSON_FLOW_ACTION.continue) {
    const missionId = nextState.activeMissionId;
    if (missionId && missionId !== previousState.activeMissionId) {
      const mission = missions.find((candidate) => candidate.id === missionId);
      if (mission) {
        const event = startMission(mission, previousState.missionProgress[missionId]).event;
        return event ? [event] : [];
      }
    }
    return [];
  }

  if (action.type === LESSON_FLOW_ACTION.hint) {
    const missionId = previousState.activeMissionId;
    const mission = missions.find((candidate) => candidate.id === missionId);
    const progress = missionId ? previousState.missionProgress[missionId] : undefined;
    const event = mission && progress ? requestMissionHint(mission, progress).event : undefined;
    return event ? [event] : [];
  }

  if (action.type === LESSON_FLOW_ACTION.checkMission) {
    const missionId = previousState.activeMissionId;
    const mission = missions.find((candidate) => candidate.id === missionId);
    const progress = missionId ? previousState.missionProgress[missionId] : undefined;
    const goalState = recordProperty(action.payload, "state");
    if (!mission || !progress || !isRecord(goalState)) {
      return [];
    }
    const event = evaluateMission(mission, goalState, progress).event;
    return event ? [event] : [];
  }

  if (action.type === LESSON_FLOW_ACTION.answer && nextState.currentAnswer !== previousState.currentAnswer) {
    return [{
      type: "assessment_answered",
      payload: {
        assessmentId: nextState.currentAnswer?.assessmentId ?? "",
        selectedOptionIndex: nextState.currentAnswer?.selectedOptionIndex ?? 0,
        correct: nextState.currentAnswer?.correct ?? false,
      },
    }];
  }
  return [];
}

function startNextMission(
  state: DeepReadonly<LessonFlowState>,
  missions: readonly MissionDefinition[],
): DeepReadonly<LessonFlowState> {
  const currentIndex = missions.findIndex((mission) => mission.id === state.activeMissionId);
  const nextMission = missions.slice(currentIndex + 1).find(
    (mission) => state.missionProgress[mission.id]?.status === "not_started",
  );
  if (!nextMission) {
    return {
      ...state,
      activeMissionId: null,
      assessmentIds: [],
      assessmentIndex: 0,
      currentAnswer: null,
    };
  }
  const progress = state.missionProgress[nextMission.id] ?? createMissionProgress();
  const transition = startMission(nextMission, progress);
  return {
    ...state,
    activeMissionId: transition.progress.status === "active" ? nextMission.id : null,
    missionProgress: { ...state.missionProgress, [nextMission.id]: transition.progress },
    assessmentIds: [],
    assessmentIndex: 0,
    currentAnswer: null,
  };
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function numberProperty(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === "number" ? property : undefined;
}

function recordProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
