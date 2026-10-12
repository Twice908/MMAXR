import type { GlassPanelItem } from "@mma/engine-render";

export interface SpatialMissionSources {
  readonly view: "lesson" | "summary" | "free-play";
  readonly step: string;
  readonly title: string;
  readonly goal: string;
  readonly progress: string;
  readonly hintFeedback: string;
  readonly missionFeedback: string;
  readonly hintLabel: string;
  readonly hintCommand: string;
  readonly hintDisabled: boolean;
  readonly checkLabel: string;
  readonly checkCommand: string;
  readonly checkDisabled: boolean;
  readonly freePlayLabel: string;
  readonly freePlayCommand: string;
  readonly resetLabel: string;
  readonly resetCommand: string;
  readonly summaryTitle: string;
  readonly summaryDetails: string;
  readonly freePlayText: string;
  readonly assessment?: {
    readonly step: string;
    readonly prompt: string;
    readonly answers: readonly { readonly label: string; readonly command: string; readonly disabled: boolean }[];
    readonly feedback: string;
    readonly continueLabel: string;
    readonly continueCommand: string;
    readonly continueHidden: boolean;
  };
}

export interface SpatialParticleSource {
  readonly label: string;
  readonly count: string;
  readonly addLabel: string;
  readonly addCommand: string;
  readonly removeLabel: string;
  readonly removeCommand: string;
}

export interface SpatialPanelsSource {
  readonly mission: SpatialMissionSources;
  readonly particles: readonly SpatialParticleSource[];
  readonly particleHeading: string;
  readonly element: {
    readonly symbol: string;
    readonly name: string;
    readonly number: string;
    readonly properties: readonly { readonly label: string; readonly value: string }[];
  };
  readonly narration: {
    readonly enableLabel: string;
    readonly enableAction: string;
    readonly enableHidden: boolean;
    readonly enableDisabled: boolean;
    readonly muteLabel: string;
    readonly muteAction: string;
    readonly replayLabel: string;
    readonly replayAction: string;
    readonly captionsLabel: string;
    readonly captionsAction: string;
    readonly speedControlId: string;
    readonly speedLabel: string;
    readonly speedValue: string;
    readonly speedOptions: readonly {
      readonly value: string;
      readonly label: string;
      readonly selected: boolean;
    }[];
    readonly muted: boolean;
    readonly captionsEnabled: boolean;
    readonly caption: string;
  };
  readonly resetViewLabel: string;
  readonly panelToggleLabel: string;
  readonly panelsExpanded: boolean;
  readonly xrDiagnostics: readonly string[];
}

export interface SpatialPanelItems {
  readonly mission: readonly GlassPanelItem[];
  readonly particles: readonly GlassPanelItem[];
  readonly elementInfo: readonly GlassPanelItem[];
  readonly narration: readonly GlassPanelItem[];
  readonly arControls?: readonly GlassPanelItem[];
  readonly xrDiagnostics?: readonly GlassPanelItem[];
  readonly settings: readonly GlassPanelItem[];
  readonly settingsToggles: Readonly<Record<string, boolean>>;
}

export interface SpatialActionHandlers {
  readonly runCommand: (command: string) => void;
  readonly onNarrationAction: (actionId: string) => void;
  readonly onNarrationSpeedChange: (speed?: string) => void;
  readonly onResetView?: () => void;
  readonly onPanelToggle?: () => void;
  readonly onExitAr?: () => void;
  readonly onCopyXrReport?: () => void;
}

const narrationActions = new Set(["enable", "mute", "replay", "captions"]);

/** Build spatial panel items from live DOM values and overlay availability. */
export function buildSpatialPanelItems(
  source: SpatialPanelsSource,
  overlayGranted = true,
  exitLabel = "Exit AR",
): SpatialPanelItems {
  const arControls = overlayGranted
    ? {}
    : {
        arControls: [
          { kind: "heading" as const, text: "AR controls" },
          { kind: "button" as const, text: exitLabel, inputId: "exit-ar", regionId: "exit-ar" },
          {
            kind: "button" as const,
            text: source.resetViewLabel,
            inputId: "reset-view",
            regionId: "reset-view",
          },
          {
            kind: "button" as const,
            text: source.panelsExpanded ? "Hide panels" : "Show panels",
            inputId: "panel-toggle",
            regionId: "panel-toggle",
          },
        ],
      };
  const xrDiagnostics = !overlayGranted && source.xrDiagnostics.length > 0
    ? {
        xrDiagnostics: [
          { kind: "heading" as const, text: "XR diagnostics" },
          ...source.xrDiagnostics.flatMap((line) =>
            wrapDiagnosticLine(line).map((text) => ({ kind: "text" as const, text }))),
          { kind: "button" as const, text: "Copy report", inputId: "copy-xr-report", regionId: "copy-xr-report" },
        ],
      }
    : {};
  if (source.mission.view === "summary") {
    return {
      mission: [
        { kind: "heading", text: source.mission.summaryTitle },
        { kind: "text", text: source.mission.summaryDetails },
        {
          kind: "button",
          text: source.mission.resetLabel,
          inputId: source.mission.resetCommand,
          regionId: source.mission.resetCommand,
        },
      ],
      particles: buildParticles(source),
      elementInfo: buildElementInfo(source),
      narration: buildNarration(source),
      ...arControls,
      ...xrDiagnostics,
      ...buildSettings(source),
    };
  }
  if (source.mission.view === "free-play") {
    return {
      mission: [
        { kind: "heading", text: source.mission.freePlayText },
        {
          kind: "button",
          text: source.mission.resetLabel,
          inputId: source.mission.resetCommand,
          regionId: source.mission.resetCommand,
        },
      ],
      particles: buildParticles(source),
      elementInfo: buildElementInfo(source),
      narration: buildNarration(source),
      ...arControls,
      ...xrDiagnostics,
      ...buildSettings(source),
    };
  }

  const mission: GlassPanelItem[] = [
    { kind: "heading", text: source.mission.step },
    { kind: "heading", text: source.mission.title },
    { kind: "text", text: source.mission.goal },
    { kind: "text", text: source.mission.progress },
    ...(source.mission.hintFeedback ? [{ kind: "text" as const, text: source.mission.hintFeedback }] : []),
    ...(source.mission.missionFeedback ? [{ kind: "text" as const, text: source.mission.missionFeedback }] : []),
    ...(!source.mission.hintDisabled
      ? [{
          kind: "button" as const,
          text: source.mission.hintLabel,
          inputId: source.mission.hintCommand,
          regionId: source.mission.hintCommand,
        }]
      : []),
    ...(!source.mission.checkDisabled
      ? [{
          kind: "button" as const,
          text: source.mission.checkLabel,
          inputId: source.mission.checkCommand,
          regionId: source.mission.checkCommand,
        }]
      : []),
    {
      kind: "button",
      text: source.mission.freePlayLabel,
      inputId: source.mission.freePlayCommand,
      regionId: source.mission.freePlayCommand,
    },
  ];
  if (source.mission.assessment) {
    const assessment = source.mission.assessment;
    mission.push(
      { kind: "heading", text: assessment.step },
      { kind: "heading", text: assessment.prompt },
      ...assessment.answers.filter((answer) => !answer.disabled).map((answer) => ({
        kind: "button" as const,
        text: answer.label,
        inputId: answer.command,
        regionId: answer.command,
      })),
      ...(assessment.feedback ? [{ kind: "text" as const, text: assessment.feedback }] : []),
      ...(!assessment.continueHidden
        ? [{
            kind: "button" as const,
            text: assessment.continueLabel,
            inputId: assessment.continueCommand,
            regionId: assessment.continueCommand,
          }]
        : []),
    );
  }
  mission.push({
    kind: "button",
    text: source.mission.resetLabel,
    inputId: source.mission.resetCommand,
    regionId: source.mission.resetCommand,
  });

  return {
    mission,
    particles: buildParticles(source),
    elementInfo: buildElementInfo(source),
    narration: buildNarration(source),
    ...arControls,
    ...xrDiagnostics,
    ...buildSettings(source),
  };
}

function buildParticles(source: SpatialPanelsSource): GlassPanelItem[] {
  const particles: GlassPanelItem[] = [{ kind: "heading", text: source.particleHeading }];
  for (const particle of source.particles) {
    particles.push(
      { kind: "text", text: `${particle.label} ${particle.count}` },
      { kind: "button", text: particle.removeLabel, inputId: particle.removeCommand, regionId: particle.removeCommand },
      { kind: "button", text: particle.addLabel, inputId: particle.addCommand, regionId: particle.addCommand },
    );
  }

  return particles;
}

function buildElementInfo(source: SpatialPanelsSource): GlassPanelItem[] {
  return [
    { kind: "heading", text: source.element.symbol },
    { kind: "heading", text: source.element.name },
    { kind: "text", text: source.element.number },
    ...source.element.properties.map((property) => ({
      kind: "text" as const,
      text: `${property.label} ${property.value}`,
    })),
  ];
}

function buildNarration(source: SpatialPanelsSource): GlassPanelItem[] {
  return [
    ...(!source.narration.enableHidden
      ? [{
          kind: "button" as const,
          text: source.narration.enableLabel,
          inputId: source.narration.enableAction,
          regionId: source.narration.enableAction,
        }]
      : []),
    {
      kind: "button",
      text: source.narration.muteLabel,
      inputId: source.narration.muteAction,
      regionId: source.narration.muteAction,
    },
    ...(source.narration.caption ? [{ kind: "text" as const, text: source.narration.caption }] : []),
  ];
}

function buildSettings(
  source: SpatialPanelsSource,
): Pick<SpatialPanelItems, "settings" | "settingsToggles"> {
  const settings: GlassPanelItem[] = [{ kind: "heading", text: "Settings" }];
  if (!source.narration.enableHidden) {
    settings.push(source.narration.enableDisabled
      ? { kind: "text", text: source.narration.enableLabel }
      : {
          kind: "button",
          text: source.narration.enableLabel,
          inputId: source.narration.enableAction,
          regionId: source.narration.enableAction,
        });
  }
  settings.push(
    {
      kind: "toggle",
      text: source.narration.muteLabel,
      inputId: source.narration.muteAction,
      regionId: source.narration.muteAction,
    },
    {
      kind: "toggle",
      text: source.narration.captionsLabel,
      inputId: source.narration.captionsAction,
      regionId: source.narration.captionsAction,
    },
    { kind: "heading", text: source.narration.speedLabel },
    ...source.narration.speedOptions.map((option) => ({
      kind: "toggle" as const,
      text: option.label,
      inputId: `narration-speed:${option.value}`,
      regionId: `narration-speed:${option.value}`,
    })),
    {
      kind: "button",
      text: source.narration.replayLabel,
      inputId: source.narration.replayAction,
      regionId: source.narration.replayAction,
    },
    {
      kind: "button",
      text: source.resetViewLabel,
      inputId: "reset-view",
      regionId: "reset-view",
    },
    {
      kind: "toggle",
      text: source.panelToggleLabel,
      inputId: "panel-toggle",
      regionId: "panel-toggle",
    },
  );
  return {
    settings,
    settingsToggles: {
      [source.narration.muteAction]: source.narration.muted,
      [source.narration.captionsAction]: source.narration.captionsEnabled,
      ...Object.fromEntries(source.narration.speedOptions.map((option) => [
        `narration-speed:${option.value}`,
        option.selected,
      ])),
      "panel-toggle": source.panelsExpanded,
    },
  };
}

/** Read panel copy and action identifiers directly from existing DOM controls. */
export function readSpatialPanelSources(root: ParentNode): SpatialPanelsSource {
  const required = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Spatial panel source not found: ${selector}`);
    return element;
  };
  const text = (selector: string): string => required<HTMLElement>(selector).textContent ?? "";
  const xrDiagnostics = root.querySelector<HTMLElement>("#xr-debug-report")?.textContent
    ?.split("\n")
    .filter((line) => line.length > 0) ?? [];
  const command = (selector: string): string => {
    const value = required<HTMLElement>(selector).dataset.command;
    if (!value) throw new Error(`Spatial panel command missing: ${selector}`);
    return value;
  };
  const narrationButton = (action: string): HTMLButtonElement =>
    required<HTMLButtonElement>(`[data-narration-action="${action}"]`);
  const assessmentCard = required<HTMLElement>("#assessment-card");
  const assessment = assessmentCard.hidden !== false ? undefined : {
    step: text("#assessment-step"),
    prompt: text("#assessment-prompt"),
    answers: [...required<HTMLElement>("#assessment-options").querySelectorAll<HTMLButtonElement>("[data-command]")].map((button) => ({
      label: button.textContent ?? "",
      command: button.dataset.command ?? "",
      disabled: button.disabled,
    })),
    feedback: text("#assessment-feedback"),
    continueLabel: text("#assessment-continue"),
    continueCommand: command("#assessment-continue"),
    continueHidden: required<HTMLButtonElement>("#assessment-continue").hidden !== false,
  };
  const speed = required<HTMLSelectElement>("#narration-speed");
  const speedValue = speed.selectedOptions[0]?.textContent ?? "";
  const cameraPanel = root.querySelector<HTMLElement>(".camera-view-panel");
  const panelToggle = cameraPanel && !cameraPanel.hidden
    ? cameraPanel.querySelector<HTMLButtonElement>("[data-camera-action='panel-toggle']")
    : root.querySelector<HTMLButtonElement>("[data-ar-action='panel-toggle']");
  if (!panelToggle) throw new Error("Spatial panel source not found: active panel toggle");
  return {
    mission: {
      view: required<HTMLElement>("#lesson-summary").hidden !== false
        ? required<HTMLElement>("#free-play-status").hidden !== false ? "lesson" : "free-play"
        : "summary",
      step: text("#mission-step"),
      title: text("#mission-title"),
      goal: text("#mission-goal"),
      progress: text("#mission-progress"),
      hintFeedback: text("#hint-feedback"),
      missionFeedback: text("#mission-feedback"),
      hintLabel: text('[data-command="lesson:hint"]'),
      hintCommand: command('[data-command="lesson:hint"]'),
      hintDisabled: required<HTMLButtonElement>('[data-command="lesson:hint"]').disabled,
      checkLabel: text('[data-command="lesson:check"]'),
      checkCommand: command('[data-command="lesson:check"]'),
      checkDisabled: required<HTMLButtonElement>('[data-command="lesson:check"]').disabled,
      freePlayLabel: text('[data-command="lesson:free-play"]'),
      freePlayCommand: command('[data-command="lesson:free-play"]'),
      resetLabel: text('[data-command="atom/reset"]'),
      resetCommand: command('[data-command="atom/reset"]'),
      summaryTitle: text("#lesson-summary h2"),
      summaryDetails: text("#lesson-summary-details"),
      freePlayText: text("#free-play-status"),
      ...(assessment ? { assessment } : {}),
    },
    particles: [...required<HTMLElement>(".particle-rail").querySelectorAll<HTMLElement>(".particle-row")].map((row) => {
      const add = row.querySelector<HTMLButtonElement>('[data-command^="particle:add:"]');
      const remove = row.querySelector<HTMLButtonElement>('[data-command^="particle:remove:"]');
      return {
        label: row.querySelector(".particle-label strong")?.textContent ?? "",
        count: row.querySelector(".particle-label span")?.textContent ?? "",
        addLabel: add?.textContent ?? "",
        addCommand: add?.dataset.command ?? "",
        removeLabel: remove?.textContent ?? "",
        removeCommand: remove?.dataset.command ?? "",
      };
    }),
    particleHeading: text(".rail-heading"),
    element: {
      symbol: text("#element-symbol"),
      name: text("#element-name"),
      number: text("#element-number"),
      properties: [...required<HTMLElement>(".property-list").querySelectorAll<HTMLElement>("div")].map((row) => ({
        label: row.querySelector("dt")?.textContent ?? "",
        value: row.querySelector("dd")?.textContent ?? "",
      })),
    },
    narration: {
      enableLabel: narrationButton("enable").textContent ?? "",
      enableAction: narrationButton("enable").dataset.narrationAction ?? "",
      enableHidden: narrationButton("enable").hidden !== false,
      enableDisabled: narrationButton("enable").disabled,
      muteLabel: narrationButton("mute").textContent ?? "",
      muteAction: narrationButton("mute").dataset.narrationAction ?? "",
      replayLabel: narrationButton("replay").textContent ?? "",
      replayAction: narrationButton("replay").dataset.narrationAction ?? "",
      captionsLabel: narrationButton("captions").textContent ?? "",
      captionsAction: narrationButton("captions").dataset.narrationAction ?? "",
      speedControlId: speed.id,
      speedLabel: required<HTMLLabelElement>(".narration-controls label").childNodes[0]?.textContent?.trim() ?? "",
      speedValue,
      speedOptions: [...speed.options].map((option) => ({
        value: option.value,
        label: option.textContent ?? "",
        selected: option.selected,
      })),
      muted: narrationButton("mute").getAttribute("aria-pressed") === "true",
      captionsEnabled: narrationButton("captions").getAttribute("aria-pressed") === "true",
      caption: text("#narration-caption"),
    },
    resetViewLabel: text('[data-command="reset-view"]'),
    panelToggleLabel: panelToggle.textContent ?? "",
    panelsExpanded: panelToggle.getAttribute("aria-expanded") === "true",
    xrDiagnostics,
  };
}

/** Route a spatial hit through the existing command and narration handlers. */
export function routeSpatialAction(inputId: string, handlers: SpatialActionHandlers): boolean {
  if (inputId === "copy-xr-report" && handlers.onCopyXrReport) {
    handlers.onCopyXrReport();
    return true;
  }
  if (narrationActions.has(inputId)) {
    handlers.onNarrationAction(inputId);
    return true;
  }
  const speedMatch = /^narration-speed:(0\.75|1|1\.25)$/.exec(inputId);
  if (speedMatch?.[1]) {
    handlers.onNarrationSpeedChange(speedMatch[1]);
    return true;
  }
  if (inputId === "narration-speed") {
    handlers.onNarrationSpeedChange();
    return true;
  }
  if (inputId === "reset-view" && handlers.onResetView) {
    handlers.onResetView();
    return true;
  }
  if (inputId === "panel-toggle" && handlers.onPanelToggle) {
    handlers.onPanelToggle();
    return true;
  }
  if (inputId === "exit-ar" && handlers.onExitAr) {
    handlers.onExitAr();
    return true;
  }
  if (isExistingCommand(inputId)) {
    handlers.runCommand(inputId);
    return true;
  }
  return false;
}

function isExistingCommand(inputId: string): boolean {
  return inputId === "atom/reset" ||
    inputId === "lesson:hint" ||
    inputId === "lesson:check" ||
    inputId === "lesson:free-play" ||
    inputId === "lesson:assessment:continue" ||
    /^lesson:assessment:answer:[0-3]$/.test(inputId) ||
    inputId === "reset-view" ||
    /^particle:(?:add|remove):(?:proton|neutron|electron)$/.test(inputId);
}

function wrapDiagnosticLine(line: string): string[] {
  const words = line.split(/\s+/);
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > 31) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
  return rows;
}
