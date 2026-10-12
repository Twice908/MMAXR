import { describe, expect, it, vi } from "vitest";
import {
  buildSpatialPanelItems,
  routeSpatialAction,
  type SpatialPanelsSource,
} from "../src/spatial-panels.js";

const source: SpatialPanelsSource = {
  mission: {
    view: "lesson",
    step: "step source",
    title: "title source",
    goal: "goal source",
    progress: "progress source",
    hintFeedback: "hint feedback source",
    missionFeedback: "mission feedback source",
    hintLabel: "hint label source",
    hintCommand: "lesson:hint",
    hintDisabled: false,
    checkLabel: "check label source",
    checkCommand: "lesson:check",
    checkDisabled: false,
    freePlayLabel: "free play source",
    freePlayCommand: "lesson:free-play",
    resetLabel: "reset source",
    resetCommand: "atom/reset",
    summaryTitle: "summary title source",
    summaryDetails: "summary detail source",
    freePlayText: "free play source",
    assessment: {
      step: "assessment step source",
      prompt: "assessment prompt source",
      answers: [
        { label: "answer source", command: "lesson:assessment:answer:0", disabled: false },
        { label: "disabled source", command: "lesson:assessment:answer:1", disabled: true },
      ],
      feedback: "assessment feedback source",
      continueLabel: "continue source",
      continueCommand: "lesson:assessment:continue",
      continueHidden: false,
    },
  },
  particles: [{
    label: "particle label source",
    count: "particle count source",
    addLabel: "+",
    addCommand: "particle:add:proton",
    removeLabel: "-",
    removeCommand: "particle:remove:proton",
  }],
  particleHeading: "particle heading source",
  element: {
    symbol: "symbol source",
    name: "element name source",
    number: "element number source",
    properties: [{ label: "property label source", value: "property value source" }],
  },
  narration: {
    enableLabel: "enable source",
    enableAction: "enable",
    enableHidden: false,
    enableDisabled: false,
    muteLabel: "mute source",
    muteAction: "mute",
    replayLabel: "replay source",
    replayAction: "replay",
    captionsLabel: "captions source",
    captionsAction: "captions",
    speedControlId: "narration-speed",
    speedLabel: "speed source",
    speedValue: "speed value source",
    speedOptions: [
      { value: "0.75", label: "0.75x source", selected: false },
      { value: "1", label: "1x source", selected: true },
      { value: "1.25", label: "1.25x source", selected: false },
    ],
    muted: false,
    captionsEnabled: true,
    caption: "caption source",
  },
  resetViewLabel: "reset view source",
  panelToggleLabel: "Show panel",
  panelsExpanded: false,
  xrDiagnostics: [],
};

describe("spatial panel data and routing", () => {
  it("preserves DOM-provided copy and existing command/action identifiers", () => {
    const panels = buildSpatialPanelItems(source);
    expect(panels.mission.map((item) => item.text)).toContain("goal source");
    expect(panels.mission.map((item) => "inputId" in item ? item.inputId : null))
      .toEqual(expect.arrayContaining([
        "lesson:hint",
        "lesson:check",
        "lesson:free-play",
        "lesson:assessment:answer:0",
        "lesson:assessment:continue",
        "atom/reset",
      ]));
    expect(panels.particles.map((item) => item.text)).toContain("particle label source particle count source");
    expect(panels.particles.map((item) => "inputId" in item ? item.inputId : null))
      .toEqual(expect.arrayContaining(["particle:add:proton", "particle:remove:proton"]));
    expect(panels.elementInfo.map((item) => item.text)).toContain("property label source property value source");
    expect(panels.narration.map((item) => item.text))
      .toEqual(expect.arrayContaining(["enable source", "mute source", "caption source"]));
    expect(panels.narration.map((item) => item.text))
      .not.toEqual(expect.arrayContaining(["replay source", "captions source", "speed source speed value source"]));
    expect(panels.settings.map((item) => item.text)).toEqual(expect.arrayContaining([
      "Settings",
      "enable source",
      "mute source",
      "captions source",
      "0.75x source",
      "1x source",
      "1.25x source",
      "replay source",
      "reset view source",
      "Show panel",
    ]));
    expect(panels.settingsToggles).toMatchObject({
      mute: false,
      captions: true,
      "narration-speed:0.75": false,
      "narration-speed:1": true,
      "narration-speed:1.25": false,
      "panel-toggle": false,
    });
  });

  it("adds reachable AR controls only when the DOM overlay is unavailable", () => {
    const withoutOverlay = buildSpatialPanelItems(source, false);
    expect(withoutOverlay.arControls?.map((item) => "inputId" in item ? item.inputId : null))
      .toEqual([null, "exit-ar", "reset-view", "panel-toggle"]);
    expect(withoutOverlay.arControls?.map((item) => item.text))
      .toContain("Show panels");
    expect(buildSpatialPanelItems(source, true).arControls).toBeUndefined();
  });

  it("adds the XR report and copy action to a dedicated panel only without overlay", () => {
    const debugSource = {
      ...source,
      xrDiagnostics: ["Supported session modes: immersive-ar", "DOM overlay granted: no"],
    };
    const withoutOverlay = buildSpatialPanelItems(debugSource, false);
    expect(withoutOverlay.xrDiagnostics?.map((item) => item.text)).toEqual([
      "XR diagnostics",
      "Supported session modes:",
      "immersive-ar",
      "DOM overlay granted: no",
      "Copy report",
    ]);
    expect(buildSpatialPanelItems(debugSource, true).xrDiagnostics).toBeUndefined();
  });

  it("calls the existing command, narration-action, and speed handlers", () => {
    const handlers = {
      runCommand: vi.fn(),
      onNarrationAction: vi.fn(),
      onNarrationSpeedChange: vi.fn(),
      onResetView: vi.fn(),
      onPanelToggle: vi.fn(),
      onExitAr: vi.fn(),
      onCopyXrReport: vi.fn(),
    };
    for (const command of [
      "lesson:hint",
      "lesson:check",
      "lesson:free-play",
      "lesson:assessment:answer:0",
      "lesson:assessment:continue",
      "atom/reset",
      "particle:add:proton",
      "particle:remove:electron",
    ]) {
      expect(routeSpatialAction(command, handlers)).toBe(true);
    }
    for (const action of ["enable", "mute", "replay", "captions"]) {
      expect(routeSpatialAction(action, handlers)).toBe(true);
    }
    expect(routeSpatialAction("narration-speed", handlers)).toBe(true);
    expect(routeSpatialAction("narration-speed:0.75", handlers)).toBe(true);
    expect(routeSpatialAction("narration-speed:1", handlers)).toBe(true);
    expect(routeSpatialAction("narration-speed:1.25", handlers)).toBe(true);
    expect(routeSpatialAction("copy-xr-report", handlers)).toBe(true);
    expect(handlers.onCopyXrReport).toHaveBeenCalledOnce();
    expect(routeSpatialAction("reset-view", handlers)).toBe(true);
    expect(routeSpatialAction("panel-toggle", handlers)).toBe(true);
    expect(routeSpatialAction("exit-ar", handlers)).toBe(true);
    expect(routeSpatialAction("unknown", handlers)).toBe(false);
    expect(handlers.runCommand).toHaveBeenCalledTimes(8);
    expect(handlers.onNarrationAction).toHaveBeenCalledTimes(4);
    expect(handlers.onNarrationSpeedChange).toHaveBeenNthCalledWith(1);
    expect(handlers.onNarrationSpeedChange).toHaveBeenNthCalledWith(2, "0.75");
    expect(handlers.onNarrationSpeedChange).toHaveBeenNthCalledWith(3, "1");
    expect(handlers.onNarrationSpeedChange).toHaveBeenNthCalledWith(4, "1.25");
    expect(handlers.onResetView).toHaveBeenCalledOnce();
    expect(handlers.onPanelToggle).toHaveBeenCalledOnce();
    expect(handlers.onExitAr).toHaveBeenCalledOnce();
  });
});
