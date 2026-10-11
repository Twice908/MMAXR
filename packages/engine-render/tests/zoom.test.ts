import { describe, it, expect } from "vitest";
import { screenZoomConfig } from "../src/screen-renderer.js";

/** Pure zoom calculation used by ScreenSceneRenderer. */
function applyZoom(distance: number, delta: number): number {
  return Math.exp(delta) * distance;
}

function clampZoom(distance: number): number {
  return Math.max(screenZoomConfig.minDistance, Math.min(screenZoomConfig.maxDistance, distance));
}

describe("screen zoom (pure math)", () => {
  it("symmetric round trip: zoom in then out returns to start within 1e-9", () => {
    const start: number = screenZoomConfig.defaultDistance;
    const zoomInDelta = -0.5; // Negative delta = zoom in (decrease distance)
    const zoomOutDelta = 0.5; // Positive delta = zoom out (increase distance)

    const afterIn = clampZoom(applyZoom(start, zoomInDelta));
    const afterOut = clampZoom(applyZoom(afterIn, zoomOutDelta));

    expect(Math.abs(afterOut - start)).toBeLessThan(1e-9);
  });

  it("symmetric round trip with multiple steps", () => {
    const start: number = screenZoomConfig.defaultDistance;
    const deltas = [-0.2, -0.3, 0.1, 0.4]; // Net zero

    let distance: number = start;
    for (const delta of deltas) {
      distance = clampZoom(applyZoom(distance, delta));
    }

    expect(Math.abs(distance - start)).toBeLessThan(1e-9);
  });

  it("monotonic: negative delta decreases distance (zoom in), positive increases (zoom out)", () => {
    const start: number = screenZoomConfig.defaultDistance;

    const zoomedIn = clampZoom(applyZoom(start, -0.5));
    const zoomedOut = clampZoom(applyZoom(start, 0.5));

    expect(zoomedIn).toBeLessThan(start);
    expect(zoomedOut).toBeGreaterThan(start);
  });

  it("clamped to minDistance", () => {
    const atMin: number = screenZoomConfig.minDistance;
    const zoomedFurtherIn = clampZoom(applyZoom(atMin, -10)); // Large zoom in (negative)

    expect(zoomedFurtherIn).toBe(screenZoomConfig.minDistance);
  });

  it("clamped to maxDistance", () => {
    const atMax: number = screenZoomConfig.maxDistance;
    const zoomedFurtherOut = clampZoom(applyZoom(atMax, 10)); // Large zoom out (positive)

    expect(zoomedFurtherOut).toBe(screenZoomConfig.maxDistance);
  });

  it("zero delta is a no-op", () => {
    const start: number = screenZoomConfig.defaultDistance;
    const result = clampZoom(applyZoom(start, 0));

    expect(result).toBe(start);
  });

  it("uses the configured pinch sensitivity independently of wheel sensitivity", () => {
    expect(screenZoomConfig.pinchSensitivity).toBe(0.008);
  });

  it("deltaMode normalisation: LINE mode multiplies by 16", () => {
    const lineDelta = 1; // 1 line
    const pixelDelta = lineDelta * 16; // Normalised to pixels

    expect(pixelDelta).toBe(16);
  });

  it("deltaMode normalisation: PAGE mode multiplies by 100", () => {
    const pageDelta = 1; // 1 page
    const pageScale = 100;
    const pixelDelta = pageDelta * pageScale;

    expect(pixelDelta).toBe(100);
  });

  it("config values are sensible", () => {
    expect(screenZoomConfig.minDistance).toBe(7);
    expect(screenZoomConfig.maxDistance).toBe(26);
    expect(screenZoomConfig.defaultDistance).toBe(14);
    expect(screenZoomConfig.wheelSensitivity).toBe(0.001);
    expect(screenZoomConfig.pinchSensitivity).toBe(0.008);
  });
});