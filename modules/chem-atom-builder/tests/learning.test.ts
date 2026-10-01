import { createStore, type EngineAction } from "@mma/engine-core";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import carbon12Items from "../assessments/m1-carbon-12.json";
import sodiumItems from "../assessments/m2-sodium-ion.json";
import carbon14Items from "../assessments/m3-carbon-14.json";
import chlorideItems from "../assessments/m4-chloride-ion.json";
import rawManifest from "../module.json";
import {
  createAtomBuilderLearningReducer,
  createAtomBuilderLearningState,
  projectAtomBuilderLearningEvents,
} from "../src/learning.js";

const manifest = moduleManifestSchema.parse(rawManifest);
const missions = manifest.missions;
const assessmentItems = [...carbon12Items, ...sodiumItems, ...carbon14Items, ...chlorideItems];

function createLearningStore(withTelemetry = false) {
  const reducer = createAtomBuilderLearningReducer(missions, assessmentItems);
  const options = withTelemetry
    ? {
        telemetry: {
          context: {
            studentRef: "opaque-test-ref",
            sessionId: "00000000-0000-4000-8000-000000000001",
            moduleId: manifest.id,
            moduleVersion: "0.0.0",
            device: { mode: "screen" as const, tier: "mid" as const },
          },
          clock: () => "2026-10-01T00:00:00.000Z",
          idGenerator: (() => {
            let nextId = 1;
            return () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
          })(),
          projectEvents: (
            action: Readonly<EngineAction>,
            previousState: Parameters<typeof projectAtomBuilderLearningEvents>[2],
            nextState: Parameters<typeof projectAtomBuilderLearningEvents>[3],
          ) => projectAtomBuilderLearningEvents(missions, action, previousState, nextState),
        },
      }
    : {};
  return createStore(reducer, createAtomBuilderLearningState(missions), options);
}

describe("Atom Builder learning flow", () => {
  it("starts missions and keeps a wrong dispatched check active until a goal matches", () => {
    const store = createLearningStore();
    store.dispatch({ type: "mission/start", payload: { missionId: missions[0]!.id } });
    expect(store.getState().activeMissionId).toBe("build-carbon-12");

    store.dispatch({
      type: "mission/check",
      payload: { state: { symbol: "C", protons: 6, neutrons: 5 } },
    });
    expect(store.getState().missionProgress["build-carbon-12"]).toEqual({
      status: "active",
      attempts: 1,
      hintsUsed: 0,
    });

    store.dispatch({
      type: "mission/check",
      payload: { state: missions[0]!.goal },
    });
    expect(store.getState().missionProgress["build-carbon-12"]).toEqual({
      status: "completed",
      attempts: 2,
      hintsUsed: 0,
    });
    expect(store.getState().assessmentIds).toEqual(missions[0]!.onComplete?.triggerAssessments);
  });

  it("counts attempts only on Check and advances hints in nudge, clue, explanation order", () => {
    const store = createLearningStore();
    store.dispatch({ type: "mission/start", payload: { missionId: missions[0]!.id } });
    expect(store.getState().missionProgress["build-carbon-12"]?.attempts).toBe(0);
    for (const expectedHintCount of [1, 2, 3]) {
      store.dispatch({ type: "mission/hint", payload: null });
      expect(store.getState().missionProgress["build-carbon-12"]?.hintsUsed).toBe(expectedHintCount);
      expect(missions[0]!.hints[expectedHintCount - 1]).toBeDefined();
    }
    store.dispatch({ type: "mission/check", payload: { state: {} } });
    expect(store.getState().missionProgress["build-carbon-12"]?.attempts).toBe(1);
    store.dispatch({ type: "mission/hint", payload: null });
    expect(store.getState().missionProgress["build-carbon-12"]?.hintsUsed).toBe(3);
  });

  it("scores both linked questions and starts the next mission after they are answered", () => {
    const store = createLearningStore();
    store.dispatch({ type: "mission/start", payload: { missionId: missions[0]!.id } });
    store.dispatch({ type: "mission/check", payload: { state: missions[0]!.goal } });
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 1 } });
    expect(store.getState().questionsCorrect).toBe(1);
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState().assessmentIndex).toBe(1);
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 0 } });
    expect(store.getState().questionsCorrect).toBe(1);
    store.dispatch({ type: "assessment/continue", payload: null });
    expect(store.getState().activeMissionId).toBe("make-na-plus");
    expect(store.getState().missionProgress["make-na-plus"]?.status).toBe("active");
  });

  it("keeps all eight fixed answer positions varied and every item pending review", () => {
    expect(assessmentItems).toHaveLength(8);
    expect(new Set(assessmentItems.map((item) => item.correctOptionIndex))).toEqual(new Set([0, 1, 2, 3]));
    expect(assessmentItems.every((item) => item.reviewStatus === "pending")).toBe(true);
  });

  it("emits learning events through the core bus to a local subscriber", () => {
    const store = createLearningStore(true);
    const received: string[] = [];
    let linkedAssessments: readonly string[] | undefined;
    store.events.subscribe("mission_started", (event) => received.push(event.type));
    store.events.subscribe("hint_used", (event) => received.push(event.type));
    store.events.subscribe("mission_completed", (event) => {
      received.push(event.type);
      linkedAssessments = event.payload.assessmentIds;
    });
    store.events.subscribe("assessment_answered", (event) => received.push(event.type));
    store.dispatch({ type: "mission/start", payload: { missionId: missions[0]!.id } });
    store.dispatch({ type: "mission/hint", payload: null });
    store.dispatch({ type: "mission/check", payload: { state: missions[0]!.goal } });
    store.dispatch({ type: "assessment/answer", payload: { selectedOptionIndex: 1 } });
    expect(received).toEqual([
      "mission_started",
      "hint_used",
      "mission_completed",
      "assessment_answered",
    ]);
    expect(linkedAssessments).toEqual(missions[0]!.onComplete?.triggerAssessments);
  });
});