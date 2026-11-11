import { describe, expect, it } from "vitest";
import { easeInOut, interpolateShot, shotDurationMs, type CameraShot } from "../src/camera-shot.js";

const wide: CameraShot = { focus: { x: 0, y: 0, z: 0 }, distance: 12, yaw: 0, pitch: 0.2 };
const close: CameraShot = { focus: { x: -2.6, y: 0.6, z: 0 }, distance: 3, yaw: 0.5, pitch: 0.4 };

describe("camera shots", () => {
  it("eases from 0 to 1, symmetric about the middle, clamped outside", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("starts and ends exactly on the two shots", () => {
    expect(interpolateShot(wide, close, 0)).toEqual(wide);
    const end = interpolateShot(wide, close, 1);
    expect(end.focus).toEqual(close.focus);
    expect(end.distance).toBeCloseTo(3, 10);
    expect(end.yaw).toBeCloseTo(0.5, 10);
    expect(end.pitch).toBeCloseTo(0.4, 10);
  });

  it("zooms by ratio and turns the short way round", () => {
    expect(interpolateShot(wide, close, 0.5).distance).toBeCloseTo(6, 10);
    const across = interpolateShot({ ...wide, yaw: 3 }, { ...wide, yaw: -3 }, 1);
    expect(across.yaw).toBeCloseTo(3 + (2 * Math.PI - 6), 10);
  });

  it("gives longer moves more time, within 0.6 to 2.2 seconds", () => {
    expect(shotDurationMs(wide, wide)).toBe(600);
    const far = shotDurationMs(wide, close);
    expect(far).toBeGreaterThan(600);
    expect(far).toBeLessThanOrEqual(2200);
    expect(shotDurationMs(wide, { ...close, focus: { x: 100, y: 0, z: 0 } })).toBe(2200);
  });
});
