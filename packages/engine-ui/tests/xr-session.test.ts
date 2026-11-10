import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildXrDiagnosticsText,
  isTouchFirstDevice,
  isXrDiagnosticsEnabled,
  scheduleComfortBreakReminder,
} from "../src/xr-session.js";

const baseData = {
  supportedModes: ["immersive-ar", "immersive-vr"],
  requestedFeatures: ["local-floor", "hand-tracking"],
  grantedFeatures: ["local-floor", "hand-tracking"],
  overlayGranted: false,
  interactionMode: "world-space",
  environmentBlendMode: "opaque",
  inputSourceTypes: ["hand", "tracked-pointer"],
  referenceSpaceType: "local-floor",
  frameRate: 90,
  scene: {
    worldReady: true,
    sessionMode: "immersive-vr" as const,
    referenceSpaceType: "adopted",
    rendererPresenting: true,
    framesRendered: 12,
    inputSourceCount: 2,
    atomWorldPosition: { x: 0, y: 1.45, z: -0.85 },
    atomScale: 0.05,
    lessonPanelsVisible: true,
  },
};

describe("XR diagnostics report", () => {
  it("formats the complete report without personal or device-identifying data", () => {
    expect(buildXrDiagnosticsText(baseData)).toBe([
      "Supported session modes: immersive-ar, immersive-vr",
      "Requested features: local-floor, hand-tracking",
      "Granted features: local-floor, hand-tracking",
      "DOM overlay granted: no",
      "Interaction mode: world-space",
      "Environment blend mode: opaque",
      "Input sources: hand, tracked-pointer",
      "Reference space: local-floor",
      "Frame rate: 90 Hz",
      "IWSDK world ready: yes",
      "Scene session mode: immersive-vr",
      "renderer.xr.isPresenting: yes",
      "XR frame count: 12",
      "XR input sources (IWSDK): 2",
      "Atom world position: (0.000, 1.450, -0.850)",
      "Atom world scale: 0.050",
      "Lesson panels visible: yes",
      "Last XR error: none",
      "Last XR error stack:\nunavailable",
    ].join("\n"));
  });

  it("includes the last XR error message and stack for on-device diagnostics", () => {
    const report = buildXrDiagnosticsText({
      ...baseData,
      lastErrorMessage: "WebGL session setup failed",
      lastErrorStack: "Error: WebGL session setup failed\n at enterSession (renderer.js:12:4)",
    });

    expect(report).toContain("Last XR error: WebGL session setup failed");
    expect(report).toContain("Last XR error stack:\nError: WebGL session setup failed");
  });

  it("enables the panel only for xrdebug=1", () => {
    expect(isXrDiagnosticsEnabled("?xrdebug=1")).toBe(true);
    expect(isXrDiagnosticsEnabled("?xrdebug=0")).toBe(false);
    expect(isXrDiagnosticsEnabled("?other=1")).toBe(false);
  });
});

describe("AR comfort break reminders", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after ten minutes", () => {
    const reminder = vi.fn();
    scheduleComfortBreakReminder(reminder);

    vi.advanceTimersByTime(10 * 60 * 1000);
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(reminder).toHaveBeenCalledOnce();
  });

  it("does not fire after the AR session ends", () => {
    const reminder = vi.fn();
    const cancel = scheduleComfortBreakReminder(reminder);

    cancel();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(reminder).not.toHaveBeenCalled();
  });
});

describe("isTouchFirstDevice", () => {
  it("treats a device without a fine pointer as touch-first, so phone VR stays hidden", () => {
    expect(isTouchFirstDevice(() => ({ matches: false }))).toBe(true);
  });

  it("keeps desktop and headset browsers with a fine pointer eligible for VR", () => {
    expect(isTouchFirstDevice((query) => ({ matches: query === "(any-pointer: fine)" }))).toBe(false);
  });
});
