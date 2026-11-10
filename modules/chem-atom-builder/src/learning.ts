import type {
  DeepReadonly,
  EngineAction,
  JsonValue,
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
  calculateCharge,
  calculateMassNumber,
  chemistryReducer,
  createChemistryState,
  elementByAtomicNumber,
  hasCompleteOuterShell,
  type ChemistryAction,
  type ChemistryState,
} from "@mma/kit-chemistry";

/** Serializable learner state for the Atom Builder: the shared lesson flow plus one atom. */
export interface AtomBuilderLearningState extends LessonFlowState {
  readonly chemistry: ChemistryState;
}

/** Create initial chemistry and mission state without starting a mission. */
export function createAtomBuilderLearningState(
  missions: readonly MissionDefinition[],
): AtomBuilderLearningState {
  return {
    chemistry: createChemistryState(1, 0),
    ...createLessonFlowState(missions),
  };
}

/** Create the pure reducer for chemistry and Atom Builder learning actions. */
export function createAtomBuilderLearningReducer(
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
): Reducer<AtomBuilderLearningState, EngineAction> {
  const lessonFlow = createLessonFlowReducer(missions, rawAssessmentItems);

  return (state, action) => {
    if (isLessonFlowAction(action)) {
      return lessonFlow<AtomBuilderLearningState>(state, action);
    }
    return {
      ...state,
      chemistry: chemistryReducer(state.chemistry, action as ChemistryAction),
    };
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
  return projectLessonFlowEvents(missions, action, previousState, nextState);
}
