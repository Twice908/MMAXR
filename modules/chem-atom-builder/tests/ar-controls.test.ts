import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildXrDiagnosticsText,
  isXrDiagnosticsEnabled,
  scheduleComfortBreakReminder,
} from "../src/ar-controls.js";

describe("XR diagnostics report", () => {
  it("formats the complete report without personal or device-identifying data", () => {
    expect(buildXrDiagnosticsText({
      supportedModes: ["immersive-ar", "immersive-vr"],
      requestedFeatures: ["hand-tracking", "hit-test"],
      grantedFeatures: ["hand-tracking"],
      overlayGranted: false,
      interactionMode: "world-space",
      environmentBlendMode: "opaque",
      inputSourceTypes: ["hand", "tracked-pointer"],
      referenceSpaceType: "local-floor",
      frameRate: 90,
    })).toBe([
      "Supported session modes: immersive-ar, immersive-vr",
      "Requested features: hand-tracking, hit-test",
      "Granted features: hand-tracking",
      "DOM overlay granted: no",
      "Interaction mode: world-space",
      "Environment blend mode: opaque",
      "Input sources: hand, tracked-pointer",
      "Reference space: local-floor",
      "Frame rate: 90 Hz",
      "Last XR error: none",
      "Last XR error stack:\nunavailable",
    ].join("\n"));
  });

  it("includes the last XR error message and stack for on-device diagnostics", () => {
    const report = buildXrDiagnosticsText({
      supportedModes: [],
      requestedFeatures: [],
      grantedFeatures: [],
      overlayGranted: null,
      interactionMode: null,
      environmentBlendMode: null,
      inputSourceTypes: [],
      referenceSpaceType: null,
      frameRate: null,
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
