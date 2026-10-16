import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  cameraDragLookDelta,
  calculateCameraLookLimits,
  deviceOrientationQuaternion,
  relativeDeviceLookAngles,
  softClampCameraAngle,
} from "../src/visuals/camera-look-around.js";
import { ANDROID_PANEL_LIMITS, xrTokens } from "../src/xr-tokens.js";

const shell = { x: 0, y: 0, width: 1, height: 1084 / 1312 };
const modelPanel = {
  x: (470 - 5) / 1312,
  y: (123 + 8) / 1312,
  width: 380 / 1312,
  height: 380 / 1312,
};
const androidLayout = { shell };

describe("Camera view look-around", () => {
  it("maps device rotation relative to the initial pose into yaw and pitch", () => {
    const initial = deviceOrientationQuaternion({
      alpha: 0,
      beta: 0,
      gamma: 0,
      screenAngleDegrees: 0,
    });
    const current = deviceOrientationQuaternion({
      alpha: 30,
      beta: 20,
      gamma: 0,
      screenAngleDegrees: 0,
    });
    const result = relativeDeviceLookAngles(initial, current);

    expect(THREE.MathUtils.radToDeg(result.yawRadians)).toBeCloseTo(30, 4);
    expect(THREE.MathUtils.radToDeg(result.pitchRadians)).toBeCloseTo(20, 4);
  });

  it("applies screen rotation to the orientation basis", () => {
    const portrait = deviceOrientationQuaternion({
      alpha: 0,
      beta: 0,
      gamma: 0,
      screenAngleDegrees: 0,
    });
    const landscape = deviceOrientationQuaternion({
      alpha: 0,
      beta: 0,
      gamma: 0,
      screenAngleDegrees: 90,
    });
    expect(portrait.angleTo(landscape)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("computes geometry-derived edge angles for each viewport orientation", () => {
    const portrait = calculateCameraLookLimits(
      androidLayout,
      modelPanel,
      xrTokens.shellWidthMeters,
      ANDROID_PANEL_LIMITS.distanceMeters.default,
      ANDROID_PANEL_LIMITS.scale.max,
      60,
      412 / 915,
      8,
    );
    const landscape = calculateCameraLookLimits(
      androidLayout,
      modelPanel,
      xrTokens.shellWidthMeters,
      ANDROID_PANEL_LIMITS.distanceMeters.default,
      ANDROID_PANEL_LIMITS.scale.max,
      60,
      915 / 412,
      8,
    );

    expect(portrait.edges.leftDegrees).toBeGreaterThan(landscape.edges.leftDegrees);
    expect(portrait.edges.leftDegrees).toBeGreaterThan(0);
    expect(portrait.edges.rightDegrees).toBeGreaterThan(0);
    expect(landscape.edges.leftDegrees).toBe(0);
    expect(portrait.yawRadians).toBeGreaterThan(0);
    expect(portrait.pitchRadians).toBeGreaterThan(0);
  });

  it("eases at the edge without exceeding the geometry limit", () => {
    const limit = Math.PI / 4;
    expect(softClampCameraAngle(limit * 0.5, limit)).toBeCloseTo(limit * 0.5);
    expect(softClampCameraAngle(limit * 20, limit)).toBeLessThanOrEqual(limit);
    expect(softClampCameraAngle(-limit * 20, limit)).toBeGreaterThanOrEqual(-limit);
  });

  it("maps one-finger drag in the opposite camera direction", () => {
    expect(cameraDragLookDelta(20, -10, 0.003)).toEqual({
      yawRadians: -0.06,
      pitchRadians: 0.03,
    });
  });
});
