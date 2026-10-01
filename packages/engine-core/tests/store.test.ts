import { describe, expect, it, vi } from "vitest";
import type { EngineAction, Reducer } from "../src/actions.js";
import { createStore, replay } from "../src/store.js";

interface CounterState {
  count: number;
}

type CounterAction = {
  readonly type: "increment";
  readonly payload: { readonly amount: number };
};

const counterReducer: Reducer<CounterState, CounterAction> = (state, action) => ({
  count: state.count + action.payload.amount,
});

describe("createStore and replay", () => {
  it("dispatches typed actions, notifies subscribers, and replays to the same state", () => {
    const store = createStore(counterReducer, { count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "increment", payload: { amount: 2 } });
    store.dispatch({ type: "increment", payload: { amount: 3 } });

    const actions = store.getActionLog();
    expect(store.getState()).toEqual({ count: 5 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(replay(counterReducer, { count: 0 }, actions)).toEqual(store.getState());
  });

  it("uses injected clock and IDs to emit schema-compatible learning events after dispatch", () => {
    const context = {
      studentRef: "opaque-id",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      moduleId: "chem.atom-builder",
      moduleVersion: "1.0.3",
      device: { mode: "screen", tier: "mid" },
    } as const;
    const projectEvents = vi.fn((_action: CounterAction, _previous: CounterState, next: CounterState) =>
      next.count === 1
        ? [{ type: "mission_started" as const, payload: { missionId: "make-na-ion" } }]
        : [],
    );
    const store = createStore(counterReducer, { count: 0 }, {
      telemetry: {
        context,
        clock: () => "2026-10-01T10:15:30Z",
        idGenerator: () => "550e8400-e29b-41d4-a716-446655440000",
        projectEvents,
      },
    });
    const listener = vi.fn();
    store.events.subscribe("mission_started", listener);

    store.dispatch({ type: "increment", payload: { amount: 1 } });

    expect(projectEvents).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      ...context,
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      ts: "2026-10-01T10:15:30Z",
      type: "mission_started",
      payload: { missionId: "make-na-ion" },
    });
  });

  it("rejects non-serializable actions and development state", () => {
    const reducer: Reducer<{ count: number }, EngineAction> = (state) => state;
    const store = createStore(reducer, { count: 0 });

    expect(() =>
      store.dispatch({
        type: "invalid",
        payload: { value: Number.NaN },
      }),
    ).toThrow(/finite numbers/);

    const invalidStateReducer: Reducer<{ count: number }, EngineAction> = () =>
      ({ count: Number.POSITIVE_INFINITY }) as { count: number };
    const invalidStateStore = createStore(invalidStateReducer, { count: 0 });
    expect(() => invalidStateStore.dispatch({ type: "change", payload: null })).toThrow(
      /finite numbers/,
    );
  });
});