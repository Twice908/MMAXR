import { describe, expect, it } from "vitest";
import {
  applyArViewGesture,
  arContentScale,
  arTouchGestureConfig,
  arWorldAnchorPosition,
  type ScreenSceneFrame,
} from "../src/screen-renderer.js";

describe("AR scene scaling", () => {
  it("uses a fixed session-local atom anchor", () => {
    expect(arWorldAnchorPosition).toEqual({ x: 0, y: 0, z: -0.6 });
  });

  describe("AR touch view gestures", () => {
    const defaultView = { scaleFactor: 1, yaw: 0, pitch: 0 } as const;

    it("bounds pinch scale to half through twice the default size", () => {
      expect(applyArViewGesture(defaultView, { type: "scale", delta: -10 }).scaleFactor)
        .toBe(arTouchGestureConfig.maxScaleFactor);
      expect(applyArViewGesture(defaultView, { type: "scale", delta: 10 }).scaleFactor)
        .toBe(arTouchGestureConfig.minScaleFactor);
    });

    it("applies configured rotation sensitivity and limits pitch to 60 degrees", () => {
      const rotated = applyArViewGesture(defaultView, {
        type: "rotate",
        deltaX: 100,
        deltaY: 100_000,
      });
      expect(rotated.yaw).toBeCloseTo(-100 * arTouchGestureConfig.rotationSensitivity);
      expect(rotated.pitch).toBeCloseTo(Math.PI / 3);

      expect(applyArViewGesture(rotated, {
        type: "rotate",
        deltaX: 0,
        deltaY: -200_000,
      }).pitch).toBeCloseTo(-Math.PI / 3);
    });
  });

  it("fits the complete outer geometry to a 27 cm diameter", () => {
    const frame: ScreenSceneFrame = {
      nucleusRadius: 0.5,
      spheres: [{
        id: "proton",
        color: 0,
        radius: 0.18,
        interactionTarget: null,
        positions: [{ x: 0, y: 0, z: 0 }],
      }],
      rings: [{ shell: 1, radius: 2, slots: [] }],
    };
    const scale = arContentScale(frame);

    expect(2 * (2 + 0.035) * scale).toBeCloseTo(0.27);
  });

  it("includes particle extent when there are no shell rings", () => {
    const frame: ScreenSceneFrame = {
      nucleusRadius: 0.5,
      spheres: [{
        id: "proton",
        color: 0,
        radius: 0.2,
        interactionTarget: null,
        positions: [{ x: 2, y: 0, z: 0 }],
      }],
      rings: [],
    };

    expect(arContentScale(frame)).toBeCloseTo(0.27 / 4.4);
  });
});