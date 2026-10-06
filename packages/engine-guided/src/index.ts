import { matchesPartialState } from "@mma/engine-core";

/** The level choices supported by a guided experience. */
export type ExperienceLevel = "basic" | "extended";

/** The mode in which a learner is using an experience. */
export type ExperienceMode = "guided" | "playground";

/** One value accepted by a table row. */
export type TableValue = string | number | boolean | null;

/** A rule describing correct values for a table row. */
export type AcceptedValueRule =
  | { readonly kind: "one_of"; readonly values: readonly TableValue[] }
  | { readonly kind: "number"; readonly expected: number; readonly tolerance: number };

/** A row that must be completed before a table step advances. */
export interface RequiredTableRow {
  readonly id: string;
  readonly accepted: AcceptedValueRule;
}

/** A guided step shared by all step-specific configurations. */
export interface StepBase {
  readonly id: string;
  readonly titleKey?: string | undefined;
  readonly promptKey?: string | undefined;
  readonly level?: ExperienceLevel | undefined;
  readonly cueId?: string | undefined;
  readonly hints: readonly [string, string, string];
}

/** A step that advances when the learner continues. */
export interface NarrateStep extends StepBase {
  readonly type: "narrate";
}

/** A step that records and reveals a prediction. */
export interface PredictStep extends StepBase {
  readonly type: "predict";
  readonly options: readonly string[];
  readonly correctOptionId: string;
}

/** A step completed when module state matches a partial goal. */
export interface ManipulateStep extends StepBase {
  readonly type: "manipulate";
  readonly goal: Readonly<Record<string, unknown>>;
}

/** A step that checks a submitted numeric value. */
export interface MeasureStep extends StepBase {
  readonly type: "measure";
  readonly expected: number;
  readonly tolerance: number;
  readonly unit: string;
}

/** A step completed when all required rows are filled correctly. */
export interface TableStep extends StepBase {
  readonly type: "table";
  readonly requiredRows: readonly RequiredTableRow[];
}

/** A step that checks the learner's final selected answer. */
export interface ConcludeStep extends StepBase {
  readonly type: "conclude";
  readonly options: readonly string[];
  readonly correctOptionId: string;
}

/** A step that refers to assessment identifiers without scoring them. */
export interface CheckStep extends StepBase {
  readonly type: "check";
  readonly assessmentIds: readonly string[];
}

/** One supported guided step configuration. */
export type ExperienceStep =
  | NarrateStep
  | PredictStep
  | ManipulateStep
  | MeasureStep
  | TableStep
  | ConcludeStep
  | CheckStep;

/** The subject-neutral definition used to create and reduce an experience. */
export interface ExperienceDefinition {
  readonly id: string;
  readonly steps: readonly ExperienceStep[];
}

/** Lifecycle status for an individual step. */
export type GuidedStepStatus = "pending" | "active" | "done";

/** Serializable lifecycle and interaction data for one step. */
export interface GuidedStepProgress {
  readonly status: GuidedStepStatus;
  readonly attempts: number;
  readonly hintsUsed: 0 | 1 | 2 | 3;
  readonly answer: TableValue | null;
}

/** Serializable state for a guided experience. */
export interface GuidedState {
  readonly activeLevel: ExperienceLevel | null;
  readonly mode: ExperienceMode;
  readonly currentStepId: string | null;
  readonly steps: Readonly<Record<string, GuidedStepProgress>>;
  readonly predictions: Readonly<Record<string, string>>;
  readonly measurements: Readonly<Record<string, number>>;
  readonly tableRows: Readonly<Record<string, Readonly<Record<string, TableValue>>>>;
  readonly completedCount: number;
  readonly completedAt: number | null;
}

/** Payloads emitted by the guided experience transitions. */
export interface GuidedEventPayloads {
  readonly step_started: { readonly experienceId: string; readonly stepId: string };
  readonly step_completed: {
    readonly experienceId: string;
    readonly stepId: string;
    readonly attempts: number;
  };
  readonly hint_used: {
    readonly experienceId: string;
    readonly stepId: string;
    readonly hintLevel: "nudge" | "clue" | "explanation";
    readonly hintId: string;
  };
  readonly prediction_made: {
    readonly experienceId: string;
    readonly stepId: string;
    readonly optionId: string;
    readonly correct: boolean;
  };
  readonly measurement_submitted: {
    readonly experienceId: string;
    readonly stepId: string;
    readonly value: number;
    readonly correct: boolean;
  };
  readonly playground_entered: { readonly experienceId: string };
  readonly experience_completed: {
    readonly experienceId: string;
    readonly completedCount: number;
    readonly completedAt: number;
  };
}

/** One typed, serializable event draft for the engine event bus. */
export type GuidedEvent = {
  [K in keyof GuidedEventPayloads]: { readonly type: K; readonly payload: GuidedEventPayloads[K] };
}[keyof GuidedEventPayloads];

/** Actions accepted by the guided experience reducer. */
export type GuidedAction =
  | { readonly type: "start"; readonly level: ExperienceLevel }
  | { readonly type: "continue" }
  | { readonly type: "answerPrediction"; readonly optionId: string }
  | { readonly type: "evaluateManipulation"; readonly moduleState: unknown }
  | { readonly type: "submitMeasurement"; readonly value: number }
  | { readonly type: "fillTableRow"; readonly rowId: string; readonly value: TableValue }
  | { readonly type: "answerConclusion"; readonly optionId: string }
  | { readonly type: "useHint" }
  | { readonly type: "enterPlayground" }
  | { readonly type: "returnToGuided" }
  | { readonly type: "restore"; readonly snapshot: GuidedState };

/** Stable reason codes for rejected transitions. */
export type GuidedReason =
  | "already_started"
  | "not_started"
  | "wrong_mode"
  | "no_active_step"
  | "wrong_step_action"
  | "invalid_option"
  | "invalid_value"
  | "unknown_row";

/** State and typed event drafts returned by one reducer transition. */
export interface GuidedTransition {
  readonly state: GuidedState;
  readonly events: readonly GuidedEvent[];
  readonly reason?: GuidedReason;
}

/** Create an empty, serializable state for an experience definition. */
export function createGuidedState(definition: ExperienceDefinition): GuidedState {
  return {
    activeLevel: null,
    mode: "guided",
    currentStepId: null,
    steps: Object.fromEntries(
      definition.steps.map(({ id }) => [
        id,
        { status: "pending", attempts: 0, hintsUsed: 0, answer: null },
      ]),
    ),
    predictions: {},
    measurements: {},
    tableRows: {},
    completedCount: 0,
    completedAt: null,
  };
}

/** Reduce one guided action, using injected time for deterministic completion events. */
export function reduceGuidedExperience(
  definition: ExperienceDefinition,
  state: GuidedState,
  action: GuidedAction,
  now: () => number,
): GuidedTransition {
  if (action.type === "restore") {
    return { state: action.snapshot, events: [] };
  }
  if (action.type === "start") {
    if (state.activeLevel !== null) {
      return invalid(state, "already_started");
    }
    const started = activateNext(definition, { ...state, activeLevel: action.level }, -1, now);
    return started;
  }
  if (action.type === "enterPlayground") {
    if (state.activeLevel === null) {
      return invalid(state, "not_started");
    }
    if (state.mode === "playground") {
      return invalid(state, "wrong_mode");
    }
    return {
      state: { ...state, mode: "playground" },
      events: [{ type: "playground_entered", payload: { experienceId: definition.id } }],
    };
  }
  if (action.type === "returnToGuided") {
    if (state.mode !== "playground") {
      return invalid(state, "wrong_mode");
    }
    return { state: { ...state, mode: "guided" }, events: [] };
  }
  if (state.mode === "playground") {
    return invalid(state, "wrong_mode");
  }
  if (state.activeLevel === null) {
    return invalid(state, "not_started");
  }
  const step = definition.steps.find(({ id }) => id === state.currentStepId);
  if (step === undefined) {
    return invalid(state, "no_active_step");
  }
  const progress = state.steps[step.id];
  if (progress === undefined || progress.status !== "active") {
    return invalid(state, "no_active_step");
  }

  switch (action.type) {
    case "continue":
      if (step.type !== "narrate" && step.type !== "check") {
        return invalid(state, "wrong_step_action");
      }
      return completeStep(definition, state, step, progress, now);
    case "answerPrediction":
      if (step.type !== "predict") {
        return invalid(state, "wrong_step_action");
      }
      if (!step.options.includes(action.optionId)) {
        return invalid(state, "invalid_option");
      }
      return completeStep(definition, {
        ...state,
        predictions: { ...state.predictions, [step.id]: action.optionId },
      }, step, { ...progress, attempts: progress.attempts + 1, answer: action.optionId }, now, [
        {
          type: "prediction_made",
          payload: {
            experienceId: definition.id,
            stepId: step.id,
            optionId: action.optionId,
            correct: action.optionId === step.correctOptionId,
          },
        },
      ]);
    case "evaluateManipulation":
      if (step.type !== "manipulate") {
        return invalid(state, "wrong_step_action");
      }
      return matchesPartialState(action.moduleState, step.goal)
        ? completeStep(definition, state, step, { ...progress, attempts: progress.attempts + 1 }, now)
        : {
            state: replaceProgress(state, step.id, { ...progress, attempts: progress.attempts + 1 }),
            events: [],
          };
    case "submitMeasurement": {
      if (step.type !== "measure") {
        return invalid(state, "wrong_step_action");
      }
      if (!Number.isFinite(action.value)) {
        return invalid(state, "invalid_value");
      }
      const correct = Math.abs(action.value - step.expected) <= step.tolerance;
      const updated: GuidedState = {
        ...state,
        measurements: { ...state.measurements, [step.id]: action.value },
      };
      const measurementEvent: GuidedEvent = {
        type: "measurement_submitted",
        payload: { experienceId: definition.id, stepId: step.id, value: action.value, correct },
      };
      return correct
        ? completeStep(
            definition,
            updated,
            step,
            { ...progress, attempts: progress.attempts + 1, answer: action.value },
            now,
            [measurementEvent],
          )
        : {
            state: replaceProgress(updated, step.id, {
              ...progress,
              attempts: progress.attempts + 1,
              answer: action.value,
            }),
            events: [measurementEvent],
          };
    }
    case "fillTableRow": {
      if (step.type !== "table") {
        return invalid(state, "wrong_step_action");
      }
      const row = step.requiredRows.find(({ id }) => id === action.rowId);
      if (row === undefined) {
        return invalid(state, "unknown_row");
      }
      const rows = {
        ...state.tableRows[step.id],
        [action.rowId]: action.value,
      };
      const updated = {
        ...state,
        tableRows: { ...state.tableRows, [step.id]: rows },
      };
      const nextProgress = { ...progress, attempts: progress.attempts + 1, answer: action.value };
      if (
        step.requiredRows.every(
          ({ id, accepted }) =>
            Object.hasOwn(rows, id) && matchesAcceptedValue(rows[id] as TableValue, accepted),
        )
      ) {
        return completeStep(definition, updated, step, nextProgress, now);
      }
      return { state: replaceProgress(updated, step.id, nextProgress), events: [] };
    }
    case "answerConclusion":
      if (step.type !== "conclude") {
        return invalid(state, "wrong_step_action");
      }
      if (!step.options.includes(action.optionId)) {
        return invalid(state, "invalid_option");
      }
      if (action.optionId !== step.correctOptionId) {
        return {
          state: replaceProgress(state, step.id, {
            ...progress,
            attempts: progress.attempts + 1,
            answer: action.optionId,
          }),
          events: [],
        };
      }
      return completeStep(
        definition,
        state,
        step,
        { ...progress, attempts: progress.attempts + 1, answer: action.optionId },
        now,
      );
    case "useHint": {
      const hintIndex = Math.min(progress.hintsUsed, 2) as 0 | 1 | 2;
      const nextHintCount = Math.min(progress.hintsUsed + 1, 3) as 0 | 1 | 2 | 3;
      const hintLevels = ["nudge", "clue", "explanation"] as const;
      const updated = replaceProgress(state, step.id, { ...progress, hintsUsed: nextHintCount });
      return {
        state: updated,
        events: [
          {
            type: "hint_used",
            payload: {
              experienceId: definition.id,
              stepId: step.id,
              hintLevel: hintLevels[hintIndex],
              hintId: step.hints[hintIndex],
            },
          },
        ],
      };
    }
    default:
      return invalid(state, "wrong_step_action");
  }
}

function activateNext(
  definition: ExperienceDefinition,
  state: GuidedState,
  previousIndex: number,
  now: () => number,
): GuidedTransition {
  const nextIndex = definition.steps.findIndex(
    (step, index) =>
      index > previousIndex && (step.level === undefined || step.level === state.activeLevel),
  );
  if (nextIndex < 0) {
    const completedAt = state.completedAt ?? now();
    const finalState = { ...state, currentStepId: null, completedAt };
    return {
      state: finalState,
      events: [
        {
          type: "experience_completed",
          payload: {
            experienceId: definition.id,
            completedCount: state.completedCount,
            completedAt,
          },
        },
      ],
    };
  }

  const step = definition.steps[nextIndex] as ExperienceStep;
  const progress = state.steps[step.id] ?? {
    status: "pending" as const,
    attempts: 0,
    hintsUsed: 0 as const,
    answer: null,
  };
  return {
    state: {
      ...state,
      currentStepId: step.id,
      steps: { ...state.steps, [step.id]: { ...progress, status: "active" } },
    },
    events: [{ type: "step_started", payload: { experienceId: definition.id, stepId: step.id } }],
  };
}

function completeStep(
  definition: ExperienceDefinition,
  state: GuidedState,
  step: ExperienceStep,
  progress: GuidedStepProgress,
  now: () => number,
  extraEvents: readonly GuidedEvent[] = [],
): GuidedTransition {
  const completedCount = state.completedCount + 1;
  const updated: GuidedState = {
    ...replaceProgress(state, step.id, { ...progress, status: "done" }),
    completedCount,
  };
  const next = activateNext(
    definition,
    updated,
    definition.steps.findIndex(({ id }) => id === step.id),
    now,
  );
  const isComplete = next.state.currentStepId === null;
  const completedAt = isComplete ? now() : next.state.completedAt;
  return {
    state: { ...next.state, completedAt },
    events: [
      {
        type: "step_completed",
        payload: { experienceId: definition.id, stepId: step.id, attempts: progress.attempts },
      },
      ...extraEvents,
      ...(isComplete
        ? [
            {
              type: "experience_completed" as const,
              payload: { experienceId: definition.id, completedCount, completedAt: completedAt as number },
            },
          ]
        : next.events),
    ],
  };
}

function replaceProgress(
  state: GuidedState,
  stepId: string,
  progress: GuidedStepProgress,
): GuidedState {
  return { ...state, steps: { ...state.steps, [stepId]: progress } };
}

function invalid(state: GuidedState, reason: GuidedReason): GuidedTransition {
  return { state, events: [], reason };
}

function matchesAcceptedValue(value: TableValue, rule: AcceptedValueRule): boolean {
  return rule.kind === "one_of"
    ? rule.values.some((candidate) => candidate === value)
    : typeof value === "number" && Math.abs(value - rule.expected) <= rule.tolerance;
}
