import { describe, expect, it } from "vitest";
import {
  PINCH_END_DISTANCE,
  PINCH_START_DISTANCE,
  PinchDetector,
  REFERENCE_HAND_SIZE,
  handScale,
  midpoint3,
  type PinchJoints,
} from "../src/xr-pinch.js";

const joints = (gap: number, size?: number): PinchJoints => ({
  thumbTip: { x: 0, y: 0, z: 0 },
  indexTip: { x: gap, y: 0, z: 0 },
  ...(size === undefined
    ? {}
    : { wrist: { x: 0, y: -size, z: 0 }, indexMetacarpal: { x: 0, y: 0, z: 0 } }),
});

describe("PinchDetector", () => {
  it("starts below the start distance and ends above the end distance", () => {
    const detector = new PinchDetector();
    expect(detector.update(joints(0.05))).toBeNull();
    expect(detector.update(joints(PINCH_START_DISTANCE - 0.002))).toBe("down");
    expect(detector.active).toBe(true);
    expect(detector.update(joints(PINCH_END_DISTANCE - 0.005))).toBeNull();
    expect(detector.active).toBe(true);
    expect(detector.update(joints(PINCH_END_DISTANCE + 0.005))).toBe("up");
    expect(detector.active).toBe(false);
  });

  it("reports the last fingertip distance", () => {
    const detector = new PinchDetector();
    expect(detector.distance).toBeNull();
    detector.update(joints(0.031));
    expect(detector.distance).toBeCloseTo(0.031);
  });

  it("scales thresholds with hand size", () => {
    const small = new PinchDetector();
    const large = new PinchDetector();
    const gap = PINCH_START_DISTANCE * 1.2;
    expect(small.update(joints(gap, REFERENCE_HAND_SIZE * 0.75))).toBeNull();
    expect(large.update(joints(gap, REFERENCE_HAND_SIZE * 1.3))).toBe("down");
  });

  it("reset clears state without an edge", () => {
    const detector = new PinchDetector();
    detector.update(joints(0.01));
    detector.reset();
    expect(detector.active).toBe(false);
    expect(detector.distance).toBeNull();
  });
});

describe("handScale", () => {
  it("is 1 when size joints are missing and clamps extremes", () => {
    expect(handScale(joints(0.02))).toBe(1);
    expect(handScale(joints(0.02, 0.01))).toBe(0.75);
    expect(handScale(joints(0.02, 0.5))).toBe(1.35);
  });
});

describe("midpoint3", () => {
  it("returns the midpoint", () => {
    expect(midpoint3({ x: 0, y: 2, z: 4 }, { x: 2, y: 0, z: 0 })).toEqual({ x: 1, y: 1, z: 2 });
  });
});
