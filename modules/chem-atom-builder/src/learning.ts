import {
  createMissionProgress,
  evaluateMission,
  requestMissionHint,
  startMission,
  type DeepReadonly,
  type EngineAction,
  type LearningEventDraft,
  type JsonValue,
  type MissionDefinition,
  type MissionProgress,
  type Reducer,
} from "@mma/engine-core";
import {
  assessmentItemSchema,
  scoreAssessmentAnswer,
} from "@mma/engine-assess";
import {
  calculateCharge,
  calculateMassNumber,
  chemistryReducer,
  createChemistryState,
  elementByAtomicNumber,
  hasCompleteOuterShell,
  type ChemistryAction,
  type ChemistryState,
} from "@mma/kit-chemistry";

/** Serializable learner state for the Atom Builder mission and check flow. */
export interface AtomBuilderLearningState {
  readonly chemistry: ChemistryState;
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

/** Create initial chemistry and mission state without starting a mission. */
export function createAtomBuilderLearningState(
  missions: readonly MissionDefinition[],
): AtomBuilderLearningState {
  return {
    chemistry: createChemistryState(1, 0),
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

/** Create the pure reducer for chemistry and Atom Builder learning actions. */
export function createAtomBuilderLearningReducer(
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
): Reducer<AtomBuilderLearningState, EngineAction> {
  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  const assessmentItems = rawAssessmentItems.map((item) => assessmentItemSchema.parse(item));
  const assessmentsById = new Map(assessmentItems.map((item) => [item.id, item]));

  return (state, action) => {
    switch (action.type) {
      case "mission/start": {
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
      case "mission/check": {
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
      case "mission/hint": {
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
      case "mode/free-play":
        return {
          ...state,
          mode: "free-play",
          activeMissionId: null,
          assessmentIds: [],
          assessmentIndex: 0,
          currentAnswer: null,
        };
      case "assessment/answer": {
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
      case "assessment/continue": {
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
        return {
          ...state,
          chemistry: chemistryReducer(state.chemistry, action as ChemistryAction),
        };
    }
  };
}

/** Convert chemistry state to partial-goal fields used by the manifest missions. */
export function missionCheckState(state: DeepReadonly<ChemistryState>): Readonly<Record<string, JsonValue>> {
  const electrons = state.shells.reduce((sum, count) => sum + count, 0);
  const element = elementByAtomicNumber(state.protons);
  return {
    ...(element ? { symbol: element.symbol } : {}),
    protons: state.protons,
    neutrons: state.neutrons,
    electrons,
    massNumber: calculateMassNumber(state.protons, state.neutrons),
    charge: calculateCharge(state.protons, electrons),
    electronConfiguration: state.shells,
    outerShellComplete: hasCompleteOuterShell(state.shells),
  };
}

/** Project dispatched learning actions to typed local learning telemetry drafts. */
export function projectAtomBuilderLearningEvents(
  missions: readonly MissionDefinition[],
  action: Readonly<EngineAction>,
  previousState: DeepReadonly<AtomBuilderLearningState>,
  nextState: DeepReadonly<AtomBuilderLearningState>,
): readonly LearningEventDraft[] {
  if (action.type === "mission/start" || action.type === "assessment/continue") {
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

  if (action.type === "mission/hint") {
    const missionId = previousState.activeMissionId;
    const mission = missions.find((candidate) => candidate.id === missionId);
    const progress = missionId ? previousState.missionProgress[missionId] : undefined;
    const event = mission && progress ? requestMissionHint(mission, progress).event : undefined;
    return event ? [event] : [];
  }

  if (action.type === "mission/check") {
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

  if (action.type === "assessment/answer" && nextState.currentAnswer !== previousState.currentAnswer) {
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
  state: DeepReadonly<AtomBuilderLearningState>,
  missions: readonly MissionDefinition[],
): AtomBuilderLearningState {
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