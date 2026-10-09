import { createStore } from "@mma/engine-core";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import rawManifest from "../module.json";
import {
  createPlaneMirrorReducer,
  createPlaneMirrorState,
  derivePlaneMirrorScene,
  MAX_SOURCE_DISTANCE,
  MIN_SOURCE_DISTANCE,
} from "../src/learning.js";

describe("plane-mirror module", () => {
  it("validates the draft manifest with the optics concepts and depth levels", () => {
    const manifest = moduleManifestSchema.parse(rawManifest);
    expect(manifest.id).toBe("physics.plane-mirror");
    expect(manifest.concepts).toContain("sci.phys.light.reflection.plane");
    expect(manifest.levels.map(({ id }) => id)).toEqual(["basic", "extended"]);
    expect(manifest.modes).toEqual(["screen"]);
  });

  it("starts with a visible ray path and equal incidence and reflection angles", () => {
    const state = createPlaneMirrorState();
    const scene = derivePlaneMirrorScene(state);
    expect(state).toEqual({ sourceDistance: 1.8 });
    expect(scene.angleOfIncidence).toBeCloseTo(scene.angleOfReflection, 10);
    expect(scene.image.x).toBeCloseTo(-scene.object.x, 10);
    expect(scene.image.y).toBeCloseTo(scene.object.y, 10);
  });

  it("updates reflected geometry and image position through dispatched source moves", () => {
    const store = createStore(createPlaneMirrorReducer(), createPlaneMirrorState());
    const initialScene = derivePlaneMirrorScene(store.getState());

    store.dispatch({ type: "object/move", payload: { distance: 2.4 } });
    const movedScene = derivePlaneMirrorScene(store.getState());

    expect(store.getState().sourceDistance).toBe(2.4);
    expect(movedScene.object.x).toBe(-2.4);
    expect(movedScene.image.x).toBe(2.4);
    expect(movedScene.hit.x).toBe(0);
    expect(movedScene.hit.y).not.toBe(initialScene.hit.y);
    expect(movedScene.reflectedDirection).not.toEqual(initialScene.reflectedDirection);
    expect(movedScene.angleOfIncidence).toBeCloseTo(movedScene.angleOfReflection, 10);
  });

  it("bounds movement deterministically and ignores invalid actions", () => {
    const store = createStore(createPlaneMirrorReducer(), createPlaneMirrorState());
    store.dispatch({ type: "object/move", payload: { distance: 99 } });
    expect(store.getState().sourceDistance).toBe(MAX_SOURCE_DISTANCE);
    store.dispatch({ type: "object/move", payload: { distance: -8 } });
    expect(store.getState().sourceDistance).toBe(MIN_SOURCE_DISTANCE);
    store.dispatch({ type: "object/move", payload: { distance: "not-a-number" } });
    expect(store.getState().sourceDistance).toBe(MIN_SOURCE_DISTANCE);

    const repeatedStore = createStore(createPlaneMirrorReducer(), createPlaneMirrorState());
    repeatedStore.dispatch({ type: "object/move", payload: { distance: 1.4 } });
    expect(derivePlaneMirrorScene(repeatedStore.getState())).toEqual(
      derivePlaneMirrorScene({
        sourceDistance: 1.4,
      }),
    );
  });
});
