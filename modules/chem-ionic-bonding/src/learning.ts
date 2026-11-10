import type {
  DeepReadonly,
  EngineAction,
  LearningEventDraft,
  MissionDefinition,
  Reducer,
} from "@mma/engine-core";
import {
  createLessonFlowReducer,
  createLessonFlowState,
  isLessonFlowAction,
  projectLessonFlowEvents,
  type LessonFlowState,
} from "@mma/engine-lesson";
import {
  createIonicBondingReducer,
  createIonicBondingState,
  ionicCompounds,
  type IonicBondingAction,
  type IonicBondingState,
  type IonicCompound,
} from "@mma/kit-chemistry";

/** Serializable learner state for Ionic Bonding: the shared lesson flow plus the bonding scene. */
export interface IonicLessonState extends LessonFlowState {
  readonly bonding: IonicBondingState;
}

const IONIC_ACTION_PREFIX = "ionic/";

/** Create the lesson and bonding state for one compound, with no mission started. */
export function createIonicLessonState(
  missions: readonly MissionDefinition[],
  compound: IonicCompound,
): IonicLessonState {
  return { bonding: createIonicBondingState(compound), ...createLessonFlowState(missions) };
}

/**
 * Create the pure reducer: lesson actions go to the shared lesson flow, `ionic/*`
 * actions to the chemistry kit's bonding rules, and anything else is ignored.
 */
export function createIonicLessonReducer(
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
  compounds: readonly IonicCompound[] = ionicCompounds,
): Reducer<IonicLessonState, EngineAction> {
  const lessonFlow = createLessonFlowReducer(missions, rawAssessmentItems);
  const bondingReducer = createIonicBondingReducer(compounds);
  return (state, action) => {
    if (isLessonFlowAction(action)) {
      return lessonFlow<IonicLessonState>(state, action);
    }
    if (action.type.startsWith(IONIC_ACTION_PREFIX)) {
      const bonding = bondingReducer(state.bonding, action as IonicBondingAction);
      return bonding === state.bonding ? (state as IonicLessonState) : { ...state, bonding } as IonicLessonState;
    }
    return state as IonicLessonState;
  };
}

/** Project dispatched lesson actions to learning telemetry drafts. */
export function projectIonicLessonEvents(
  missions: readonly MissionDefinition[],
  action: Readonly<EngineAction>,
  previousState: DeepReadonly<IonicLessonState>,
  nextState: DeepReadonly<IonicLessonState>,
): readonly LearningEventDraft[] {
  return projectLessonFlowEvents(missions, action, previousState, nextState);
}
