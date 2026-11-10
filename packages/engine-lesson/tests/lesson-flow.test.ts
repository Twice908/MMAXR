import { createStore, type EngineAction } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  createLessonFlowReducer,
  createLessonFlowState,
  isLessonFlowAction,
  projectLessonFlowEvents,
  type LessonFlowState,
} from "../src/index.js";
import { missions, rawItems } from "./fixtures.js";

/** A module state: the shared lesson fields plus the module's own subject field. */
interface CounterLessonState extends LessonFlowState {
  readonly count: number;
}

function createCounterStore() {
  const lessonFlow = createLessonFlowReducer(missions, rawItems);
  return createStore<CounterLessonState, EngineAction>(
    (state, action) => {
      if (isLessonFlowAction(action)) return lessonFlow<CounterLessonState>(state, action);
      if (action.type === "counter/add") return { ...state, count: state.count + 1 };
      return state;
    },
    { count: 0, ...createLessonFlowState(missions) },
  );
}

const check = (count: number): EngineAction => ({ type: "mission/check", payload: { state: { count } } });

describe("lesson flow state", () => {
  it("starts with every mission not started and nothing active", () => {
    expect(createLessonFlowState(missions)).toEqual({
      mode: "mission",
      activeMissionId: null,
      missionProgress: {
        "reach-three": { status: "not_started", attempts: 0, hintsUsed: 0 },
        "reach-zero": { status: "not_started", attempts: 0, hintsUsed: 0 },
      },
      assessmentIds: [],
      assessmentIndex: 0,
      currentAnswer: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
    });
  });

  it("owns only the six lesson action types", () => {
    for (const type of ["mission/start", "mission/check", "mission/hint", "mode/free-play", "assessment/answer", "assessment/continue"]) {
      expect(isLessonFlowAction({ type, payload: null })).toBe(true);
    }
    expect(isLessonFlowAction({ type: "counter/add", payload: null })).toBe(false);
    expect(isLessonFlowAction({ type: "atom/reset", payload: null })).toBe(false);
  });
});

describe("lesson flow reducer", () => {
  it("keeps the module's own fields and returns the same object when nothing changes", () => {
    const reducer = createLessonFlowReducer(missions, rawItems);
    const state: CounterLessonState = { count: 7, ...createLessonFlowState(missions) };
    expect(reducer<CounterLessonState>(state, { type: "mission/hint", payload: null })).toBe(state);
    expect(reducer<CounterLessonState>(state, { type: "counter/add", payload: null })).toBe(state);
    const started = reducer<CounterLessonState>(state, { type: "mission/start", payload: { missionId: "reach-three" } });
    expect(started.count).toBe(7);
    expect(started.activeMissionId).toBe("reach-three");
  });

  it("ignores unknown missions and starts nothing in free play", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "missing" } });
    expect(store.getState().activeMissionId).toBeNull();
    store.dispatch({ type: "mode/free-play", payload: null });
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-three" } });
    expect(store.getState().activeMissionId).toBeNull();
    expect(store.getState().mode).toBe("free-play");
  });

  it("counts wrong checks, completes on a match, and opens the linked questions", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-three" } });
    store.dispatch(check(2));
    expect(store.getState().missionProgress["reach-three"]).toEqual({ status: "active", attempts: 1, hintsUsed: 0 });
    store.dispatch(check(3));
    expect(store.getState().missionProgress["reach-three"]).toEqual({ status: "completed", attempts: 2, hintsUsed: 0 });
    expect(store.getState().assessmentIds).toEqual(["assess.test.01", "assess.test.02"]);
  });

  it("ignores answers when no question is showing", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-three" } });
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 0 } });
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState()).toMatchObject({ questionsAnswered: 0, activeMissionId: "reach-three" });
  });

  it("stops giving hints after the last one", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-zero" } });
    store.dispatch({ type: "mission/hint", payload: null });
    store.dispatch({ type: "mission/hint", payload: null });
    expect(store.getState().missionProgress["reach-zero"]?.hintsUsed).toBe(1);
  });

  it("scores one answer per question, then starts the next mission", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-three" } });
    store.dispatch(check(3));
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 2 } });
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 1 } });
    expect(store.getState()).toMatchObject({ questionsAnswered: 1, questionsCorrect: 1 });
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState()).toMatchObject({ assessmentIndex: 1, currentAnswer: null });
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 3 } });
    expect(store.getState()).toMatchObject({ questionsAnswered: 2, questionsCorrect: 1 });
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState().activeMissionId).toBe("reach-zero");
    expect(store.getState().assessmentIds).toEqual([]);
  });

  it("ends with no active mission after the last mission's questions", () => {
    const store = createCounterStore();
    store.dispatch({ type: "mission/start", payload: { missionId: "reach-zero" } });
    store.dispatch(check(0));
    expect(store.getState().assessmentIds).toEqual(["assess.test.03"]);
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 1 } });
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState()).toMatchObject({ activeMissionId: null, assessmentIds: [], questionsCorrect: 1 });
  });
});

describe("lesson flow events", () => {
  it("projects start, hint, completion and answer events", () => {
    const store = createCounterStore();
    const events: string[] = [];
    const run = (action: EngineAction): void => {
      const previous = store.getState();
      store.dispatch(action);
      events.push(...projectLessonFlowEvents(missions, action, previous, store.getState()).map((event) => event.type));
    };
    run({ type: "mission/start", payload: { missionId: "reach-three" } });
    run({ type: "mission/hint", payload: null });
    run(check(1));
    run(check(3));
    run({ type: "assessment/answer", payload: { selectedOptionIndex: 0 } });
    run({ type: "assessment/continue", payload: null });
    run({ type: "counter/add", payload: null });
    expect(events).toEqual(["mission_started", "hint_used", "mission_completed", "assessment_answered"]);
  });
});
