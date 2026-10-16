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
      scene: {
        sessionMode: "immersive-vr",
        referenceSpaceType: "local-floor",
        referenceSpaceReady: true,
        firstFramePoseWasNull: true,
        firstNonNullViewerPose: {
          position: { x: 0, y: 1.6, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        latestFramePose: {
          position: { x: 0, y: 1.6, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        atomWorldPosition: { x: 0, y: 1.45, z: -0.8 },
        atomWorldScale: { x: 0.1, y: 0.1, z: 0.1 },
        atomVisibilityChain: [
          { name: "AtomRoot", visible: true },
          { name: "Group", visible: true },
          { name: "Scene", visible: true },
        ],
        xrCameraToAtomDistanceMeters: 0.814,
        panelGroupWorldPosition: { x: 0, y: 1.45, z: -0.8 },
        panelGroupWorldScale: { x: 1, y: 1, z: 1 },
        panelGroupDistanceMeters: 1,
        panelGroupSliderValues: { positionMeters: 1, scale: 1 },
        panelGroupWorldRotation: { x: 0, y: 0, z: 0, w: 1 },
        modelStage: {
          position: { x: -0.12, y: 0.08, z: 0.016 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          zoom: 1.25,
          nearestSurfaceDistanceMeters: 0.8,
          bindingLimit: "nearest-surface-min",
          relativeToModelPanelCenter: { x: -0.08, y: 0.04, z: 0.016 },
          fitsInsideModelArea: true,
        },
        atomViewerSpace: {
          distanceMeters: 0.814,
          direction: { x: 0, y: -0.184, z: -0.983 },
        },
        atomInsideViewFrustum: true,
        rendererPresenting: true,
        framebufferSize: { width: 1832, height: 1920 },
        framesRendered: 12,
        viewCount: 2,
        environmentPresent: true,
        sceneIssues: ["ar-placement-reticle: visible=false"],
      },
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
      "Scene session mode: immersive-vr",
      "Renderer reference space actually used: local-floor (ready: yes)",
      "First frame pose was null: yes",
      "First non-null viewer pose: position (0.000, 1.600, 0.000), orientation (0.000, 0.000, 0.000, 1.000)",
      "Latest frame viewer pose: position (0.000, 1.600, 0.000), orientation (0.000, 0.000, 0.000, 1.000)",
      "Atom world position: (0.000, 1.450, -0.800)",
      "Atom root world scale: (0.100, 0.100, 0.100)",
      "Atom visibility (atom -> scene): AtomRoot:visible > Group:visible > Scene:visible",
      "XR camera-to-atom distance: 0.814 m",
      "Panel group world position: (0.000, 1.450, -0.800)",
      "Panel group world scale: (1.000, 1.000, 1.000)",
      "Panel group distance from viewer: 1.000 m",
      "Position slider value: 1.000 m",
      "Scale slider value: 1.000",
      "Active panel layout: unavailable",
      "Panel limits: unavailable",
      "Required look angles L/R/U/D: unavailable",
      "Layout fits at minimum scale: unavailable",
      "Panel group world rotation (x, y, z, w): (0.000, 0.000, 0.000, 1.000)",
      "Atom position relative to model-panel centre: (-0.080, 0.040, 0.016)",
      "Model stage position: (-0.120, 0.080, 0.016)",
      "Model stage rotation (x, y, z, w): (0.000, 0.000, 0.000, 1.000)",
      "Model stage zoom: 1.250",
      "Model nearest-surface distance: 0.800 m",
      "Model stage binding limit: nearest-surface-min",
      "fits inside model area: yes",
      "Atom in viewer space: 0.814 m, direction (0.000, -0.184, -0.983)",
      "Atom position inside view frustum: yes",
      "renderer.xr.isPresenting: yes",
      "XR base layer framebuffer: 1832 x 1920",
      "XR frame count: 12",
      "View count: 2",
      "VR environment present: yes",
      "Scene object issues: ar-placement-reticle: visible=false",
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
      scene: {
        sessionMode: null,
        referenceSpaceType: null,
        referenceSpaceReady: false,
        firstFramePoseWasNull: null,
        firstNonNullViewerPose: null,
        latestFramePose: null,
        atomWorldPosition: { x: 0, y: 0, z: 0 },
        atomWorldScale: { x: 1, y: 1, z: 1 },
        atomVisibilityChain: [],
        xrCameraToAtomDistanceMeters: null,
        panelGroupWorldPosition: null,
        atomViewerSpace: null,
        atomInsideViewFrustum: null,
        rendererPresenting: false,
        framebufferSize: null,
        framesRendered: 0,
        viewCount: null,
        environmentPresent: false,
        sceneIssues: [],
      },
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
