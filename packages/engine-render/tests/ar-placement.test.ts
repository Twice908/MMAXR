import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  calculateArViewerPlacement,
  clampArPlacementDistance,
  hasArHitTest,
  moveArPlacement,
  resetArPlacement,
  isHandheldArSession,
  shouldUsePhoneHitTest,
} from "../src/screen-renderer.js";
import { spatialLayout } from "../src/spatial-layout.js";

describe("AR placement", () => {
  it("places from a viewer pose at the configured forward and downward offsets", () => {
    const orientation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    const placement = calculateArViewerPlacement({
      position: { x: 1, y: 1.7, z: 2 },
      orientation,
    });
    const expected = new THREE.Vector3(1, 1.7, 2)
      .add(new THREE.Vector3(0, 0, -1).applyQuaternion(orientation)
        .multiplyScalar(spatialLayout.arPlacement.viewerForwardMeters))
      .add(new THREE.Vector3(0, -1, 0).applyQuaternion(orientation)
        .multiplyScalar(spatialLayout.arPlacement.viewerDownMeters));

    expect(placement.position.x).toBeCloseTo(expected.x);
    expect(placement.position.y).toBeCloseTo(expected.y);
    expect(placement.position.z).toBeCloseTo(expected.z);
    expect(placement.distanceMeters).toBe(spatialLayout.arPlacement.viewerForwardMeters);
  });

  it("uses hit testing only when granted for a touch-first session", () => {
    expect(hasArHitTest(["dom-overlay"])).toBe(false);
    expect(shouldUsePhoneHitTest(false, false, true)).toBe(false);
    expect(hasArHitTest(["hit-test"])).toBe(true);
    expect(shouldUsePhoneHitTest(true, false, true)).toBe(true);
    expect(shouldUsePhoneHitTest(true, true, true)).toBe(false);
    expect(shouldUsePhoneHitTest(true, false, false)).toBe(false);
  });

  it("uses interaction mode and blend mode to select handheld or headset placement", () => {
    expect(isHandheldArSession({ interactionMode: "screen-space" }, true, false)).toBe(true);
    expect(isHandheldArSession({ interactionMode: "world-space" }, false, true)).toBe(false);
    expect(isHandheldArSession({ environmentBlendMode: "opaque" }, false, true)).toBe(false);
    expect(isHandheldArSession({}, false, true)).toBe(true);
  });

  it("limits reposition distance and restores the saved initial placement", () => {
    expect(clampArPlacementDistance(-10)).toBe(spatialLayout.arPlacement.minimumDistanceMeters);
    expect(clampArPlacementDistance(10)).toBe(spatialLayout.arPlacement.maximumDistanceMeters);
    expect(moveArPlacement(spatialLayout.arPlacement.viewerForwardMeters, 0, 0, -100).distance)
      .toBe(spatialLayout.arPlacement.maximumDistanceMeters);
    expect(moveArPlacement(spatialLayout.arPlacement.viewerForwardMeters, 0, 100, 0).side)
      .toBe(spatialLayout.arPlacement.maximumDistanceMeters);

    const initial = calculateArViewerPlacement({
      position: { x: 0, y: 1.6, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    });
    const moved = moveArPlacement(initial.distanceMeters, 0.4, 0, 1);
    expect(moved).not.toEqual({
      distance: initial.distanceMeters,
      side: 0,
    });
    expect(resetArPlacement(initial)).toEqual(initial);
  });
});
