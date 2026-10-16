import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  calculateModelStageLayout,
  easeModelStageValue,
  moveModelStageAxis,
  modelFitsStageArea,
  modelStageZoomBounds,
  nearestModelSurfaceDistance,
  panModelStage,
  resetModelStagePose,
  rotateModelStage,
  zoomModelStage,
  type ModelStagePose,
} from "../src/visuals/model-stage.js";
import { MODEL_LIMITS, MODEL_STAGE } from "../src/xr-tokens.js";

const modelArea = { x: 0.08, y: 0.08, width: 0.62, height: 0.48 };
const overlayControl = { x: 0.64, y: 0.12, width: 0.12, height: 0.2 };
const shellWidth = 0.98;
const modelRadius = 0.6;

function defaultPose(home = { x: 0, y: 0, z: MODEL_STAGE.frontOffsetMeters }): ModelStagePose {
  return resetModelStagePose(home);
}

describe("immersive model stage", () => {
  it("fits the complete model inside the unobstructed model area at default zoom", () => {
    const layout = calculateModelStageLayout(
      modelArea,
      [overlayControl],
      shellWidth,
      modelRadius,
    );
    const overlapsControl = layout.safeRect.x < overlayControl.x + overlayControl.width &&
      layout.safeRect.x + layout.safeRect.width > overlayControl.x &&
      layout.safeRect.y < overlayControl.y + overlayControl.height &&
      layout.safeRect.y + layout.safeRect.height > overlayControl.y;
    expect(overlapsControl).toBe(false);
    expect(layout.fitScale * modelRadius).toBeCloseTo(layout.fitRadius);
    expect(modelFitsStageArea(layout, 1, MODEL_LIMITS.zoom.default)).toBe(true);
  });

  it.each([0.75, 1.25])("keeps the fit inside the scaled panel group at scale %s", (scale) => {
    const layout = calculateModelStageLayout(modelArea, [overlayControl], shellWidth, modelRadius);
    expect(modelFitsStageArea(layout, scale, MODEL_LIMITS.zoom.default)).toBe(true);
  });

  it("reports pan limits on each axis and fails the fit check after leaving the model area", () => {
    const layout = calculateModelStageLayout(modelArea, [overlayControl], shellWidth, modelRadius);
    const x = moveModelStageAxis(0.77, 0.1, "x");
    const y = moveModelStageAxis(-0.6, -0.1, "y");
    expect(x.value).toBeLessThanOrEqual(MODEL_LIMITS.panMeters.x);
    expect(x.bindingLimit).toBe("pan-x");
    expect(y.value).toBeGreaterThanOrEqual(-MODEL_LIMITS.panMeters.y);
    expect(y.bindingLimit).toBe("pan-y");
    expect(modelFitsStageArea(
      layout,
      1,
      MODEL_LIMITS.zoom.default,
      { x: MODEL_LIMITS.panMeters.x, y: layout.home.y, z: layout.home.z },
    )).toBe(false);
  });

  it("moves with the group and does not mutate group rotation", () => {
    const layout = calculateModelStageLayout(modelArea, [], shellWidth, modelRadius);
    const group = new THREE.Group();
    const stage = new THREE.Group();
    stage.position.set(layout.home.x, layout.home.y, layout.home.z);
    group.add(stage);
    group.position.set(1, 2, 3);
    group.rotation.set(0.2, -0.4, 0.3);
    const rotation = group.quaternion.clone();
    group.updateMatrixWorld(true);
    const initialWorld = stage.getWorldPosition(new THREE.Vector3());
    group.position.x += 0.5;
    group.scale.setScalar(1.25);
    group.updateMatrixWorld(true);
    const movedWorld = stage.getWorldPosition(new THREE.Vector3());
    expect(movedWorld.x).not.toBeCloseTo(initialWorld.x);
    expect(group.quaternion.angleTo(rotation)).toBeCloseTo(0);
  });

  it("eases pan at both edges and leaves Z unchanged", () => {
    const soft = easeModelStageValue(0.95, -1, 1);
    expect(soft).toBeLessThan(1);
    expect(easeModelStageValue(0.94, -1, 1))
      .toBeLessThan(easeModelStageValue(0.95, -1, 1));
    expect(easeModelStageValue(1.4, -1, 1)).toBe(1);
    expect(easeModelStageValue(-1.4, -1, 1)).toBe(-1);
    expect(easeModelStageValue(-0.95, -1, 1)).toBeLessThan(-0.95);
    const moved = panModelStage(defaultPose(), 100, -100);
    expect(moved.pose.position.x).toBe(MODEL_LIMITS.panMeters.x);
    expect(moved.pose.position.y).toBe(-MODEL_LIMITS.panMeters.y);
    expect(moved.pose.position.z).toBe(defaultPose().position.z);
    expect(moved.bindingLimit).toBe("pan-x");
  });

  it("rotates freely about all three axes", () => {
    const rotated = rotateModelStage(new THREE.Quaternion(), 0.3, 0.2);
    const euler = new THREE.Euler().setFromQuaternion(rotated, "XYZ");
    expect(Math.abs(euler.x)).toBeGreaterThan(0);
    expect(Math.abs(euler.y)).toBeGreaterThan(0);
    expect(Math.abs(euler.z)).toBeGreaterThan(0);
  });

  it("clamps zoom to minimum, maximum, and nearest-surface limits", () => {
    const nearestMinimum = zoomModelStage(defaultPose(), 10, 0.8, 0.25, 1);
    expect(nearestMinimum.pose.zoom).toBeCloseTo(1.2);
    expect(nearestMinimum.bindingLimit).toBe("nearest-surface-min");
    const zoomMaximum = zoomModelStage(defaultPose(), 10, 1, 0.1, 1);
    expect(zoomMaximum.pose.zoom).toBe(MODEL_LIMITS.zoom.max);
    expect(zoomMaximum.bindingLimit).toBe("zoom-max");
    const distanceMaximum = zoomModelStage(defaultPose(), -10, 2.2, 0.25, 1);
    expect(distanceMaximum.pose.zoom).toBeCloseTo(0.8);
    expect(distanceMaximum.bindingLimit).toBe("nearest-surface-max");
    const zoomMinimum = zoomModelStage(defaultPose(), -10, 1, 0.1, 1);
    expect(zoomMinimum.pose.zoom).toBe(MODEL_LIMITS.zoom.min);
    expect(zoomMinimum.bindingLimit).toBe("zoom-min");
  });

  it("calculates nearest-surface distance and effective zoom bounds", () => {
    expect(nearestModelSurfaceDistance(1, 0.2, 1.25, 2)).toBeCloseTo(0.5);
    const bounds = modelStageZoomBounds(0.8, 0.25, 1);
    expect(bounds.max).toBeCloseTo(1.2);
    expect(bounds.maxBinding).toBe("nearest-surface-min");
  });

  it("resets position to the supplied home, rotation to identity, and zoom to 1", () => {
    const home = { x: -0.12, y: 0.08, z: MODEL_STAGE.frontOffsetMeters };
    expect(resetModelStagePose(home)).toEqual({
      position: home,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      zoom: MODEL_LIMITS.zoom.default,
    });
  });
});
