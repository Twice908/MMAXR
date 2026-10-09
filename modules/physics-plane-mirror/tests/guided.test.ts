import { createStore } from "@mma/engine-core";
import {
  type GuidedAction,
  type GuidedState,
} from "@mma/engine-guided";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import rawManifest from "../module.json";
import {
  createPlaneMirrorGuidedState,
  planeMirrorExperience,
  planeMirrorManifest,
  reducePlaneMirrorGuidedAction,
  restorePlaneMirrorGuidedState,
  toPlaneMirrorGuidedModuleState,
} from "../src/guided.js";
import {
  createPlaneMirrorReducer,
  createPlaneMirrorState,
  derivePlaneMirrorScene,
} from "../src/learning.js";

function send(state: GuidedState, action: GuidedAction): GuidedState {
  return reducePlaneMirrorGuidedAction(state, action);
}

describe("plane-mirror guided walkthrough", () => {
  it("loads a valid draft experience with the intended short step sequence", () => {
    const manifest = moduleManifestSchema.parse(rawManifest);

    expect(manifest.releaseStatus).toBe("draft");
    expect(manifest.experience?.steps.map(({ type }) => type)).toEqual([
      "narrate",
      "narrate",
      "predict",
      "manipulate",
      "measure",
      "table",
      "conclude",
      "check",
    ]);
    expect(planeMirrorExperience.id).toBe(manifest.id);
    expect(planeMirrorManifest.experience?.playground.enabled).toBe(true);
    expect(manifest.assessments).toEqual([
      { id: "assess.phys.light.reflection.plane.pending", reviewed: false },
    ]);
  });

  it("starts at the observation step and advances through narration to prediction", () => {
    let state = createPlaneMirrorGuidedState();
    expect(state.currentStepId).toBe("observe-setup");

    state = send(state, { type: "continue" });
    expect(state.currentStepId).toBe("introduce-reflection");
    state = send(state, { type: "continue" });
    expect(state.currentStepId).toBe("predict-angles");

    state = send(state, { type: "answerPrediction", optionId: "angles-different" });
    expect(state.currentStepId).toBe("move-source");
    expect(state.predictions["predict-angles"]).toBe("angles-different");
  });

  it("completes manipulation from the existing B4a source movement and preserves its scene", () => {
    let guided = createPlaneMirrorGuidedState();
    guided = send(guided, { type: "continue" });
    guided = send(guided, { type: "continue" });
    guided = send(guided, { type: "answerPrediction", optionId: "angles-equal" });

    const store = createStore(createPlaneMirrorReducer(), createPlaneMirrorState());
    store.dispatch({ type: "object/move", payload: { distance: 2.4 } });
    guided = send(guided, {
      type: "evaluateManipulation",
      moduleState: toPlaneMirrorGuidedModuleState(store.getState()),
    });
    const scene = derivePlaneMirrorScene(store.getState());

    expect(guided.currentStepId).toBe("measure-angles");
    expect(store.getState().sourceDistance).toBe(2.4);
    expect(scene.object.x).toBe(-2.4);
    expect(scene.image.x).toBe(2.4);
    expect(scene.angleOfIncidence).toBeCloseTo(scene.angleOfReflection, 10);
    expect(
      toPlaneMirrorGuidedModuleState(createPlaneMirrorState()).sourceMoved,
    ).toBe(false);
  });

  it("keeps incorrect measurements active for retry and records a correct measurement", () => {
    let state = createPlaneMirrorGuidedState();
    for (const action of [
      { type: "continue" },
      { type: "continue" },
      { type: "answerPrediction", optionId: "angles-equal" },
      { type: "evaluateManipulation", moduleState: { sourceMoved: true } },
    ] satisfies readonly GuidedAction[]) {
      state = send(state, action);
    }

    state = send(state, { type: "submitMeasurement", value: 1 });
    expect(state.currentStepId).toBe("measure-angles");
    expect(state.steps["measure-angles"]?.attempts).toBe(1);

    state = send(state, { type: "submitMeasurement", value: 0 });
    expect(state.currentStepId).toBe("record-observations");
    expect(state.measurements["measure-angles"]).toBe(0);
  });

  it("records both observation rows before allowing a conclusion", () => {
    let state = createPlaneMirrorGuidedState();
    for (const action of [
      { type: "continue" },
      { type: "continue" },
      { type: "answerPrediction", optionId: "angles-equal" },
      { type: "evaluateManipulation", moduleState: { sourceMoved: true } },
      { type: "submitMeasurement", value: 0 },
      { type: "fillTableRow", rowId: "angle-observation", value: "equal" },
    ] satisfies readonly GuidedAction[]) {
      state = send(state, action);
    }

    expect(state.currentStepId).toBe("record-observations");
    state = send(state, { type: "fillTableRow", rowId: "image-observation", value: "equal" });
    expect(state.currentStepId).toBe("conclude");
    expect(state.tableRows["record-observations"]).toEqual({
      "angle-observation": "equal",
      "image-observation": "equal",
    });
  });

  it("rejects an incorrect conclusion and accepts a retry before the check step", () => {
    let state = createPlaneMirrorGuidedState();
    for (const action of [
      { type: "continue" },
      { type: "continue" },
      { type: "answerPrediction", optionId: "angles-equal" },
      { type: "evaluateManipulation", moduleState: { sourceMoved: true } },
      { type: "submitMeasurement", value: 0 },
      { type: "fillTableRow", rowId: "angle-observation", value: "equal" },
      { type: "fillTableRow", rowId: "image-observation", value: "equal" },
    ] satisfies readonly GuidedAction[]) {
      state = send(state, action);
    }

    state = send(state, { type: "answerConclusion", optionId: "angles-different" });
    expect(state.currentStepId).toBe("conclude");
    expect(state.steps.conclude?.attempts).toBe(1);

    state = send(state, { type: "answerConclusion", optionId: "angles-equal" });
    expect(state.currentStepId).toBe("check");
  });

  it("completes the runner check and preserves progress through Playground and resume", () => {
    let state = createPlaneMirrorGuidedState();
    state = send(state, { type: "enterPlayground" });
    expect(state.mode).toBe("playground");
    const blocked = send(state, { type: "continue" });
    expect(blocked.currentStepId).toBe("observe-setup");

    state = send(state, { type: "returnToGuided" });
    expect(state.currentStepId).toBe("observe-setup");
    state = send(state, { type: "continue" });
    const resumed = restorePlaneMirrorGuidedState(JSON.parse(JSON.stringify(state)));
    expect(resumed).toEqual(state);

    for (const action of [
      { type: "continue" },
      { type: "answerPrediction", optionId: "angles-equal" },
      { type: "evaluateManipulation", moduleState: { sourceMoved: true } },
      { type: "submitMeasurement", value: 0 },
      { type: "fillTableRow", rowId: "angle-observation", value: "equal" },
      { type: "fillTableRow", rowId: "image-observation", value: "equal" },
      { type: "answerConclusion", optionId: "angles-equal" },
      { type: "continue" },
    ] satisfies readonly GuidedAction[]) {
      state = send(state, action);
    }
    expect(state.currentStepId).toBeNull();
    expect(state.completedCount).toBe(8);
  });

  it("rejects malformed saved runner state instead of accepting invalid progress", () => {
    expect(() => restorePlaneMirrorGuidedState({ mode: "guided" })).toThrow(
      "Saved plane-mirror guided progress is invalid.",
    );
  });
});
