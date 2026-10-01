import {
  telemetryEventSchema,
  type TelemetryEvent,
} from "@mma/schema";
import type {
  Clock,
  DeepReadonly,
  EngineAction,
  IdGenerator,
  Reducer,
} from "./actions.js";
import {
  EventBus,
  type LearningEventDraft,
  type LearningEventMap,
} from "./events.js";
import { assertJsonSerializable, cloneJson, deepFreeze } from "./serialization.js";

/** Telemetry fields supplied by the host; identity remains an opaque reference. */
export type TelemetryContext = Omit<
  TelemetryEvent,
  "eventId" | "ts" | "type" | "payload"
>;

/** Dependencies used to project dispatches into fully formed telemetry events. */
export interface DispatchTelemetry<State, Action extends EngineAction> {
  readonly context: TelemetryContext;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly projectEvents: (
    action: Readonly<Action>,
    previousState: DeepReadonly<State>,
    nextState: DeepReadonly<State>,
  ) => readonly LearningEventDraft[];
}

/** Optional store diagnostics and telemetry integration. */
export interface StoreOptions<State, Action extends EngineAction> {
  /** Defaults to true; disable only when the host deliberately opts out of runtime state checks. */
  readonly development?: boolean;
  readonly telemetry?: DispatchTelemetry<State, Action>;
}

/** The minimal state, dispatch, subscription, action-log, and event interface. */
export interface Store<State, Action extends EngineAction> {
  /** Return the current deeply read-only state snapshot. */
  getState(): DeepReadonly<State>;
  /** Apply one action and notify state and learning-event subscribers. */
  dispatch(action: Action): void;
  /** Subscribe to committed state changes. */
  subscribe(
    listener: (state: DeepReadonly<State>, action: Readonly<Action>) => void,
  ): () => void;
  /** Return a detached snapshot of the actions dispatched so far. */
  getActionLog(): readonly Readonly<Action>[];
  /** Typed learning events emitted after a successful dispatch. */
  readonly events: EventBus<LearningEventMap>;
}

/** Create a framework-agnostic store. Reducers receive frozen state and action data. */
export function createStore<State, Action extends EngineAction>(
  reducer: Reducer<State, Action>,
  initialState: State,
  options: StoreOptions<State, Action> = {},
): Store<State, Action> {
  const development = options.development ?? true;
  let state = deepFreeze(
    cloneJson(initialState, "initial state"),
  ) as DeepReadonly<State>;
  const telemetry = options.telemetry
    ? {
        ...options.telemetry,
        context: deepFreeze(cloneJson(options.telemetry.context, "telemetry context")),
      }
    : undefined;
  const actionLog: Action[] = [];
  const stateListeners = new Set<
    (state: DeepReadonly<State>, action: Readonly<Action>) => void
  >();
  const events = new EventBus<LearningEventMap>();

  const dispatch = (action: Action): void => {
    const frozenAction = deepFreeze(cloneJson(action, "action")) as Action;
    const previousState = state;
    const candidateState = reducer(previousState, frozenAction);

    if (development) {
      assertJsonSerializable(candidateState, "next state");
    }

    const nextState = deepFreeze(candidateState) as DeepReadonly<State>;
    const emittedEvents = telemetry
      ? materializeEvents(
          telemetry.projectEvents(frozenAction, previousState, nextState),
          telemetry,
        )
      : [];

    state = nextState;
    actionLog.push(frozenAction);

    for (const event of emittedEvents) {
      emitLearningEvent(events, event);
    }
    for (const listener of [...stateListeners]) {
      listener(state, frozenAction);
    }
  };

  return {
    getState: () => state,
    dispatch,
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    getActionLog: () => Object.freeze(actionLog.slice()),
    events,
  };
}

/** Replay a serializable action sequence from its initial state without side effects. */
export function replay<State, Action extends EngineAction>(
  reducer: Reducer<State, Action>,
  initialState: State,
  actions: readonly Action[],
): DeepReadonly<State> {
  let state = deepFreeze(
    cloneJson(initialState, "initial state"),
  ) as DeepReadonly<State>;

  for (const action of actions) {
    const frozenAction = deepFreeze(cloneJson(action, "replay action")) as Action;
    const nextState = reducer(state, frozenAction);
    assertJsonSerializable(nextState, "replayed state");
    state = deepFreeze(
      cloneJson(nextState, "replayed state"),
    ) as DeepReadonly<State>;
  }

  return state;
}

function materializeEvents<State, Action extends EngineAction>(
  drafts: readonly LearningEventDraft[],
  telemetry: DispatchTelemetry<State, Action>,
): LearningEventMap[keyof LearningEventMap][] {
  return drafts.map((draft) => {
    const parsed = telemetryEventSchema.parse({
      ...telemetry.context,
      eventId: telemetry.idGenerator(),
      ts: telemetry.clock(),
      type: draft.type,
      payload: draft.payload,
    });
    return parsed as LearningEventMap[keyof LearningEventMap];
  });
}

function emitLearningEvent(
  events: EventBus<LearningEventMap>,
  event: LearningEventMap[keyof LearningEventMap],
): void {
  switch (event.type) {
    case "mission_started":
      events.emit("mission_started", event);
      break;
    case "mission_completed":
      events.emit("mission_completed", event);
      break;
    case "mission_failed":
      events.emit("mission_failed", event);
      break;
    case "hint_used":
      events.emit("hint_used", event);
      break;
    case "assessment_answered":
      events.emit("assessment_answered", event);
      break;
  }
}