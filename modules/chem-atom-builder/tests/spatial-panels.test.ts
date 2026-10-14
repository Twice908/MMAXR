import { describe, expect, it, vi } from "vitest";
import {
  buildAtomCaptionItems,
  buildSpatialPanelItems,
  createAtomCaptionUpdater,
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
  particles: [
    {
      label: "Proton",
      count: "6",
      color: "rgb(214, 76, 53)",
      addLabel: "+",
      addCommand: "particle:add:proton",
      removeLabel: "-",
      removeCommand: "particle:remove:proton",
    },
    {
      label: "Neutron",
      count: "6",
      color: "rgb(40, 127, 131)",
      addLabel: "+",
      addCommand: "particle:add:neutron",
      removeLabel: "-",
      removeCommand: "particle:remove:neutron",
    },
    {
      label: "Electron",
      count: "6",
      color: "rgb(240, 179, 35)",
      addLabel: "+",
      addCommand: "particle:add:electron",
      removeLabel: "-",
      removeCommand: "particle:remove:electron",
    },
  ],
  particleHeading: "particle heading source",
  element: {
    symbol: "C",
    name: "Carbon",
    number: "ELEMENT 06",
    status: "ATOM STATE",
    properties: [
      { label: "Atomic number Z", value: "6" },
      { label: "Mass number A", value: "12" },
      { label: "Charge", value: "0" },
      { label: "Electron configuration", value: "2,4" },
      { label: "Outer shell", value: "Incomplete" },
    ],
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
  panelToggleLabel: "Expand panels",
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
    expect(panels.particles.map((item) => item.text)).toEqual(expect.arrayContaining([
      "Proton 6",
      "Neutron 6",
      "Electron 6",
    ]));
    expect(panels.particles.map((item) => "inputId" in item ? item.inputId : null))
      .toEqual(expect.arrayContaining([
        "particle:add:proton",
        "particle:remove:proton",
        "particle:add:neutron",
        "particle:remove:neutron",
        "particle:add:electron",
        "particle:remove:electron",
      ]));
    expect(panels.particles.filter((item) => item.kind === "button").every((item) =>
      item.variant === "secondary" && item.targetSizeDp === 48 && item.layoutGroup === "particle-row",
    )).toBe(true);
    expect(panels.particles.every((item) =>
      item.kind !== "text" || item.layoutGroup !== "particle-row" || item.markerColor !== undefined,
    )).toBe(true);
    expect(panels.elementInfo.map((item) => item.text)).toContain("Electron configuration 2,4");
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
    ]));
    expect(panels.settings.map((item) => item.text))
      .not.toEqual(expect.arrayContaining(["reset view source", "Expand panels"]));
    expect(panels.settingsToggles).toMatchObject({
      mute: false,
      captions: true,
      "narration-speed:0.75": false,
      "narration-speed:1": true,
      "narration-speed:1.25": false,
    });
  });

  it("adds reachable AR controls only when the DOM overlay is unavailable", () => {
    const withoutOverlay = buildSpatialPanelItems(source, false);
    expect(withoutOverlay.arControls?.map((item) => "inputId" in item ? item.inputId : null))
      .toEqual([null, "exit-ar", "reset-view", "panel-toggle"]);
    expect(withoutOverlay.arControls?.map((item) => item.text))
      .toContain("Expand panels");
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

  it("builds caption text from the Element and particle values shared with the DOM panel source", () => {
    const carbonCaption = buildAtomCaptionItems(source).map((item) => item.text);
    expect(carbonCaption).toEqual([
      "Carbon (C)",
      "Atomic number Z 6",
      "Mass number A 12",
      "Charge 0",
      "Proton 6",
      "Neutron 6",
      "Electron 6",
    ]);

    const noElement = {
      ...source,
      element: {
        ...source.element,
        symbol: "",
        name: "No element yet",
        number: "",
        properties: [
          { label: "Atomic number Z", value: "0" },
          { label: "Mass number A", value: "0" },
          { label: "Charge", value: "0" },
          ...source.element.properties.slice(3),
        ],
      },
      particles: source.particles.map((particle) => ({ ...particle, count: "0" })),
    };
    expect(buildAtomCaptionItems(noElement).map((item) => item.text)).toEqual([
      "No element yet",
      "Atomic number Z 0",
      "Mass number A 0",
      "Charge 0",
      "Proton 0",
      "Neutron 0",
      "Electron 0",
    ]);

    const sodiumIon = {
      ...source,
      particles: source.particles.map((particle) => ({
        ...particle,
        count: particle.label === "Proton" ? "11" : particle.label === "Neutron" ? "12" : "10",
      })),
      element: {
        ...source.element,
        symbol: "Na",
        name: "Sodium",
        number: "ELEMENT 11",
        properties: [
          { label: "Atomic number Z", value: "11" },
          { label: "Mass number A", value: "23" },
          { label: "Charge", value: "+1" },
          ...source.element.properties.slice(3),
        ],
      },
    };
    expect(buildAtomCaptionItems(sodiumIon).map((item) => item.text)).toEqual([
      "Sodium (Na)",
      "Atomic number Z 11",
      "Mass number A 23",
      "Charge +1",
      "Proton 11",
      "Neutron 12",
      "Electron 10",
    ]);
  });

  it("routes particle +/- controls to the same commands used by the DOM rows", () => {
    const handlers = {
      runCommand: vi.fn(),
      onNarrationAction: vi.fn(),
      onNarrationSpeedChange: vi.fn(),
    };
    const buttons = buildSpatialPanelItems(source).particles.filter((item) =>
      item.kind === "button" && "inputId" in item);
    expect(buildSpatialPanelItems(source).particles
      .filter((item) => item.kind === "text" && item.layoutGroup === "particle-row")
      .map((item) => "inputId" in item ? item.inputId : null))
      .toEqual([
        "particle:token:proton",
        "particle:token:neutron",
        "particle:token:electron",
      ]);
    expect(buildSpatialPanelItems(source, true, "Exit AR", false).particles
      .filter((item) => item.kind === "text" && item.layoutGroup === "particle-row")
      .every((item) => !("inputId" in item))).toBe(true);
    for (const button of buttons) {
      if (!("inputId" in button)) continue;
      expect(routeSpatialAction(button.inputId, handlers)).toBe(true);
    }
    expect(handlers.runCommand.mock.calls.map(([command]) => command)).toEqual([
      "particle:remove:proton",
      "particle:add:proton",
      "particle:remove:neutron",
      "particle:add:neutron",
      "particle:remove:electron",
      "particle:add:electron",
    ]);
  });

  it("keeps Particles and Element available in both mission and free play", () => {
    const missionPanels = buildSpatialPanelItems(source);
    const freePlayPanels = buildSpatialPanelItems({
      ...source,
      mission: { ...source.mission, view: "free-play" },
    });
    expect(freePlayPanels.particles.map((item) => item.text))
      .toEqual(missionPanels.particles.map((item) => item.text));
    expect(freePlayPanels.elementInfo.map((item) => item.text))
      .toEqual(missionPanels.elementInfo.map((item) => item.text));
    expect(freePlayPanels.particles.map((item) => "inputId" in item ? item.inputId : null))
      .toContain("particle:add:electron");
    expect(freePlayPanels.elementInfo).toHaveLength(missionPanels.elementInfo.length);
  });

  it("only emits caption updates when DOM-derived caption content changes", () => {
    const update = vi.fn();
    const updater = createAtomCaptionUpdater(update);
    expect(updater(source)).toBe(true);
    expect(updater(source)).toBe(false);
    expect(update).toHaveBeenCalledOnce();
    const changed = { ...source, particles: source.particles.map((particle) => ({
      ...particle,
      count: particle.label === "Proton" ? "7" : particle.count,
    })) };
    expect(updater(changed)).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
