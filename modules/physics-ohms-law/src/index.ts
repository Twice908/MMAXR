import {
  createIdGenerator,
  createStore,
  type EngineAction,
  type LearningEventMap,
  type TelemetryContext,
} from "@mma/engine-core";
import { assessmentItemSchema, type AssessmentItem } from "@mma/engine-assess";
import { buildLessonView, lessonCommandToAction, type LessonViewCopy } from "@mma/engine-lesson";
import {
  CircuitView,
  SceneRenderer,
  ScreenInputAdapter,
  XR_COMMAND,
  arTouchGestureConfig,
  installZoomControls,
  screenZoomConfig,
  type InputAction,
  type ScreenZoomDistances,
  type WorldOptions,
} from "@mma/engine-render";
import {
  arHudStatusText,
  createArHud,
  createDataTable,
  createLessonPanel,
  createNarrationBar,
  createXyGraph,
  el,
  mountArControls,
  narrationButtonLabels,
  setText,
} from "@mma/engine-ui";
import "@mma/engine-ui/lesson-ui.css";
import "@mma/engine-ui/xr-hud.css";
import {
  NarrationPlayer,
  createNarrationAssetLoader,
  publishNarrationTelemetry,
  type NarrationViewState,
} from "@mma/engine-voice";
import { telemetryEventSchema } from "@mma/schema";
import {
  CIRCUIT_BENCH_ACTION,
  layoutSeriesLoop,
  solveCircuit,
  type Circuit,
  type CircuitLayout,
  type CircuitSolution,
} from "@mma/kit-physics";
import metersItems from "../assessments/m1-meters.json";
import potentialDifferenceItems from "../assessments/m2-potential-difference.json";
import resistanceItems from "../assessments/m3-resistance.json";
import bulbItems from "../assessments/m4-filament-bulb.json";
import {
  LOAD_CHOICES,
  PART_ID,
  createOhmsLawLessonReducer,
  createOhmsLawLessonState,
  ohmsLawCheckState,
  placeMeter,
  projectOhmsLawLessonEvents,
  swapLoadAction,
  type MeterKind,
} from "./learning.js";
import { manifest } from "./manifest.js";
import {
  buildBenchView,
  buildXrPanelsContent,
  graphData,
  meterName,
  meterSpots,
  nextLoadId,
  readingRows,
  sceneLabels,
  toSceneFrame,
  type MeterSpotView,
  type SceneLabel,
} from "./view-model.js";
import "./ohms-law.css";

export { manifest };

/** Generated narration (MP3 from the shared Piper generator) and captions, bundled by Vite. */
const narrationAudioUrls = import.meta.glob<string>("../narration/en/generated/*.mp3", { eager: true, import: "default" });
const narrationCaptionFiles = import.meta.glob<string>("../narration/en/generated/*.vtt", { eager: true, query: "?raw", import: "default" });

/** The circuit is fitted to the stage; the default is only the closest the fit may come. */
const OHM_ZOOM: ScreenZoomDistances = { minDistance: 8, maxDistance: 40, defaultDistance: 10 };

/** In AR/VR the loop (10 units) is drawn about 30 cm wide, about 55 cm with its meters. */
const XR_CONTENT_SCALE = 0.03;
/** Lift the model and panels so the circuit sits just above eye level in AR and VR. */
const XR_LIFT = 0.15;
/** Narration commands from the headset panel dock. */
const NARRATION_COMMAND = { sound: "narration:sound", captions: "narration:captions", replay: "narration:replay" } as const;
/** Outlined 24px icons for the phone AR tab bar. */
const ICON = {
  mission: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
  circuit: '<path d="M4 7h4M16 7h4v10H4V7"/><path d="M8 7l1.5-2 2 4 2-4 2 4 0.5-2"/><path d="M10 15v4M14 13v8"/>',
  readings: '<path d="M4 20V4M4 20h16"/><path d="M6 17l4-5 3 2 6-8"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
} as const;

/** Move a label so it grows away from its part, on the side the layout chose. */
const LABEL_SHIFT = {
  left: "translate(-100%, -50%)",
  right: "translate(0, -50%)",
  above: "translate(-50%, -100%)",
  below: "translate(-50%, 0)",
} as const;

const LESSON_COPY: LessonViewCopy = {
  idleEyebrow: "OHM'S LAW",
  freePlayTitle: "Explore freely",
  freePlayBody: "Change the cells, the part and the meters, and record any readings you like.",
  notYetFeedback: "Not yet. The circuit or the readings do not match every part of the goal. Read the goal again and check once more.",
};

const rawAssessmentItems = [...metersItems, ...potentialDifferenceItems, ...resistanceItems, ...bulbItems];
const assessmentItems: readonly AssessmentItem[] = rawAssessmentItems.map((item) => assessmentItemSchema.parse(item));

/** Mount-time options for the Ohm's Law web view. */
export interface OhmsLawOptions {
  /** IWSDK project options (`virtual:iwsdk-project`); renderer defaults are used when omitted. */
  readonly worldOptions?: WorldOptions;
  /** Called when the student presses "Experiments"; the button is hidden when omitted. */
  readonly onExit?: () => void;
}

/**
 * Mount the Ohm's Law experiment and return its full teardown. It opens in the screen
 * (web) view; supported devices also offer AR (phones with ARCore, headsets) and VR
 * (headsets), and the desktop emulator for development.
 */
export function mountOhmsLaw(root: HTMLElement, options: OhmsLawOptions = {}): () => void {
  const page = el(document, "div", "ohm mma-ui mma-narration-web");
  page.innerHTML = `
    <header class="ohm-header">
      <button class="mma-button mma-button--quiet ohm-back" type="button" data-app-action="exit" hidden>
        <span aria-hidden="true">&larr;</span> Experiments
      </button>
      <div class="ohm-title">
        <p class="mma-eyebrow">Physics &middot; Current Electricity</p>
        <h1>Ohm's Law</h1>
      </div>
      <button class="mma-button mma-button--secondary ohm-reset" type="button" data-command="circuit:reset">Start over</button>
    </header>
    <main class="ohm-layout">
      <div class="ohm-lesson" data-slot="lesson"></div>
      <section class="ohm-stage mma-card" aria-labelledby="ohm-stage-title">
        <div class="ohm-stage__bar">
          <h2 class="mma-eyebrow" id="ohm-stage-title">Live circuit</h2>
          <div class="ohm-stage__actions" data-slot="xr-entry">
            <button class="mma-button mma-button--quiet" type="button" data-command="view:reset">Reset view</button>
          </div>
        </div>
        <div class="ohm-scene" data-slot="scene">
          <div class="ohm-labels" data-slot="labels" aria-hidden="true"></div>
          <div class="ohm-spots" data-slot="spots"></div>
        </div>
        <p class="ohm-legend"><span class="ohm-legend__arrow" aria-hidden="true">&#9654;</span> Arrows show the direction of conventional current, from + to &minus;. Faster dots mean a larger current.</p>
        <p class="ohm-tip">Drag the model to turn it. Scroll or pinch to zoom.</p>
        <p class="ohm-status" data-slot="status" role="status" aria-live="polite"></p>
        <div class="ohm-caption" data-slot="caption"></div>
      </section>
      <section class="ohm-bench mma-card" data-slot="bench" aria-labelledby="ohm-bench-title">
        <h2 class="ohm-section-title" id="ohm-bench-title">Circuit</h2>
        <div class="ohm-group" role="group" aria-labelledby="ohm-meters-title">
          <h3 class="ohm-group__title" id="ohm-meters-title">Meters</h3>
          <div class="ohm-row">
            <button class="mma-button mma-button--secondary ohm-tool" type="button" data-command="tool:ammeter" aria-pressed="false">Ammeter</button>
            <button class="mma-button mma-button--secondary ohm-tool" type="button" data-command="tool:voltmeter" aria-pressed="false">Voltmeter</button>
          </div>
          <p class="ohm-help" data-slot="spot-help"></p>
          <div class="ohm-row ohm-spot-list" data-slot="spot-list"></div>
        </div>
        <div class="ohm-group" role="group" aria-labelledby="ohm-battery-title">
          <h3 class="ohm-group__title" id="ohm-battery-title">Battery</h3>
          <div class="ohm-row ohm-stepper">
            <button class="mma-button mma-button--secondary ohm-step" type="button" data-command="cells:remove" aria-label="Remove a cell">&minus;</button>
            <output class="ohm-stepper__value" data-slot="battery" aria-live="polite"></output>
            <button class="mma-button mma-button--secondary ohm-step" type="button" data-command="cells:add" aria-label="Add a cell">+</button>
          </div>
        </div>
        <div class="ohm-group" role="group" aria-labelledby="ohm-switch-title">
          <h3 class="ohm-group__title" id="ohm-switch-title">Switch</h3>
          <button class="mma-button mma-button--secondary" type="button" data-command="switch:toggle" data-slot="switch"></button>
        </div>
        <div class="ohm-group" role="group" aria-labelledby="ohm-load-title">
          <h3 class="ohm-group__title" id="ohm-load-title">Part to test</h3>
          <div class="ohm-row" data-slot="loads"></div>
        </div>
        <dl class="ohm-meters">
          <div><dt>Ammeter</dt><dd data-slot="ammeter"></dd></div>
          <div><dt>Voltmeter</dt><dd data-slot="voltmeter"></dd></div>
        </dl>
        <button class="mma-button mma-button--primary ohm-record" type="button" data-command="reading:record">Record reading</button>
      </section>
      <section class="ohm-readings mma-card" data-slot="readings" aria-labelledby="ohm-readings-title">
        <div class="ohm-readings__bar">
          <h2 class="ohm-section-title" id="ohm-readings-title">Readings</h2>
          <button class="mma-button mma-button--quiet" type="button" data-command="readings:clear">Clear readings</button>
        </div>
        <div data-slot="table"></div>
        <div data-slot="graph"></div>
      </section>
    </main>
  `;
  root.replaceChildren(page);

  const slot = <Element extends HTMLElement>(name: string): Element => {
    const found = page.querySelector<Element>(`[data-slot="${name}"]`);
    if (!found) throw new Error(`Ohm's Law element missing: ${name}`);
    return found;
  };
  const sceneHost = slot<HTMLElement>("scene");
  const labelsLayer = slot<HTMLElement>("labels");
  const spotsLayer = slot<HTMLElement>("spots");
  const statusLine = slot<HTMLElement>("status");
  const spotHelp = slot<HTMLElement>("spot-help");
  const spotList = slot<HTMLElement>("spot-list");
  const batteryOutput = slot<HTMLElement>("battery");
  const switchButton = slot<HTMLButtonElement>("switch");
  const loadsRow = slot<HTMLElement>("loads");
  const ammeterOutput = slot<HTMLElement>("ammeter");
  const voltmeterOutput = slot<HTMLElement>("voltmeter");
  const removeCell = page.querySelector<HTMLButtonElement>('[data-command="cells:remove"]')!;
  const addCell = page.querySelector<HTMLButtonElement>('[data-command="cells:add"]')!;
  const lessonPanel = createLessonPanel();
  slot<HTMLElement>("lesson").append(lessonPanel.element);

  for (const choice of LOAD_CHOICES) {
    const button = el(document, "button", "mma-button mma-button--secondary ohm-load", choice.label);
    button.type = "button";
    button.dataset.command = `load:${choice.id}`;
    button.setAttribute("aria-pressed", "false");
    loadsRow.append(button);
  }

  const table = createDataTable({
    caption: "Readings",
    emptyText: "No readings yet. Close the switch and press Record reading.",
    columns: [
      { key: "number", label: "#", numeric: true },
      { key: "part", label: "Part" },
      { key: "cells", label: "Cells", numeric: true },
      { key: "volts", label: "V (V)", numeric: true },
      { key: "amps", label: "I (A)", numeric: true },
      { key: "ratio", label: "V ÷ I (Ω)", numeric: true },
    ],
  });
  slot<HTMLElement>("table").append(table.element);
  const graph = createXyGraph({
    title: "V–I graph",
    xLabel: "Current I (A)",
    yLabel: "Potential difference V (V)",
    emptyText: "Your readings will appear here.",
  });
  slot<HTMLElement>("graph").append(graph.element);

  const circuitView = new CircuitView();
  const renderer = new SceneRenderer({
    host: sceneHost,
    content: circuitView,
    screenZoom: OHM_ZOOM,
    xrContentScale: XR_CONTENT_SCALE,
    handheldOverlay: true,
    xrLift: XR_LIFT,
    ...(options.worldOptions === undefined ? {} : { worldOptions: options.worldOptions }),
  });
  const disposeZoom = installZoomControls(
    sceneHost,
    () => renderer.getDistance(),
    (distance) => renderer.setDistance(distance),
    { ...screenZoomConfig, ...OHM_ZOOM },
  );

  const idGenerator = createIdGenerator({ crypto: globalThis.crypto, now: Date.now });
  const telemetryContext = {
    studentRef: idGenerator(),
    sessionId: idGenerator(),
    moduleId: manifest.id,
    moduleVersion: "0.0.0",
    device: { mode: "screen", tier: "mid" },
  } satisfies TelemetryContext;
  const store = createStore(
    createOhmsLawLessonReducer(manifest.missions, rawAssessmentItems),
    createOhmsLawLessonState(manifest.missions),
    {
      telemetry: {
        context: telemetryContext,
        clock: () => new Date().toISOString(),
        idGenerator,
        projectEvents: (action, previous, next) => projectOhmsLawLessonEvents(manifest.missions, action, previous, next),
      },
    },
  );

  // UI-only state (never learning state). Declared before the narration player, which
  // reports its first view from its constructor.
  // Immersive session state: phone AR uses the page HUD; headsets and the emulator use panels.
  let xrActive = false;
  let xrPanels = false;
  let xrExitLabel = "Exit AR";
  let narrationView: NarrationViewState | null = null;
  let tool: MeterKind | null = null;
  let notice = "";
  let lastHintText = "";
  let layout: CircuitLayout | null = null;
  let solution: CircuitSolution = solveCircuit(store.getState().bench.circuit as Circuit);
  let labels: readonly SceneLabel[] = [];
  let spots: readonly MeterSpotView[] = [];
  let frame = 0;
  let fitted = false;
  const labelElements = new Map<string, HTMLElement>();
  const spotElements = new Map<string, HTMLButtonElement>();
  // --- Narration (shared player, loader and bar) ---------------------------------
  const narrationBar = createNarrationBar({
    enableSound: () => void narrationPlayer.enableSound(),
    toggleMuted: () => narrationPlayer.toggleMuted(),
    replay: () => narrationPlayer.replayLastCue(),
    toggleCaptions: () => narrationPlayer.toggleCaptions(),
    setSpeed: (speed) => narrationPlayer.setSpeed(speed),
  });
  slot<HTMLElement>("lesson").append(narrationBar.element);
  // The caption sits under the model, where the student is looking.
  slot<HTMLElement>("caption").append(narrationBar.caption);
  const narrationPlayer = new NarrationPlayer({
    cues: manifest.narration?.cues ?? [],
    events: store.events,
    moduleId: manifest.id,
    activityTarget: page,
    ...createNarrationAssetLoader({ audioUrls: narrationAudioUrls, captions: narrationCaptionFiles }),
    onViewChange: (view) => {
      narrationView = view;
      narrationBar.update(view);
      if (xrPanels) refreshPanels();
    },
    onTelemetry: (draft) =>
      publishNarrationTelemetry(draft, store.events, telemetryContext, () => new Date().toISOString(), idGenerator),
  });

  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  // Matches the phone layout in ohms-law.css: the panel lists the parts, the model shows the readings.
  const compactLabels = window.matchMedia?.("(max-width: 599px)");

  const circuit = (): Circuit => store.getState().bench.circuit as Circuit;

  const dispatch = (action: EngineAction): void => {
    notice = "";
    store.dispatch(action);
  };

  const placeChosenMeter = (key: string): void => {
    if (!tool) return;
    const spot = spots.find((item) => item.key === key);
    if (!spot) return;
    dispatch({ type: CIRCUIT_BENCH_ACTION.rewire, payload: { circuit: placeMeter(circuit(), tool, spot.spot) } });
    if (store.getState().bench.validationMessages[0]) {
      store.events.emit("invalid_placement", {
        type: "invalid_placement",
        payload: { missionId: store.getState().activeMissionId, particle: tool, target: key },
      });
    } else {
      notice = `${meterName(tool)} placed: ${spot.label.charAt(0).toLowerCase()}${spot.label.slice(1)}.`;
      tool = null;
    }
  };

  const runCommand = (command: string): void => {
    const state = store.getState();
    const bench = state.bench;
    if (command === "view:reset") {
      renderer.resetView();
      return;
    }
    if (command === XR_COMMAND.exit) {
      page.querySelector<HTMLButtonElement>("[data-ar-action='exit']")?.click();
      return;
    }
    if (command === XR_COMMAND.recenter) {
      renderer.recenter();
      return;
    }
    if (command === NARRATION_COMMAND.sound) {
      if (!narrationView?.audioEnabled) void narrationPlayer.enableSound();
      else narrationPlayer.toggleMuted();
      return;
    }
    if (command === NARRATION_COMMAND.captions) {
      narrationPlayer.toggleCaptions();
      return;
    }
    if (command === NARRATION_COMMAND.replay) {
      narrationPlayer.replayLastCue();
      return;
    }
    if (command === "load:next") {
      runCommand(`load:${nextLoadId(buildBenchView(bench, solution, "").loadId)}`);
      return;
    }
    if (command === "tool:ammeter" || command === "tool:voltmeter") {
      const kind = command === "tool:ammeter" ? "ammeter" : "voltmeter";
      tool = tool === kind ? null : kind;
      dispatch({ type: CIRCUIT_BENCH_ACTION.clearValidation, payload: null });
    } else if (command.startsWith("meter:place:")) {
      placeChosenMeter(command.slice("meter:place:".length));
    } else if (command === "cells:add" || command === "cells:remove") {
      const battery = circuit().components.find((part) => part.id === PART_ID.battery);
      const cells = battery?.kind === "battery" ? battery.cells : 1;
      dispatch({
        type: CIRCUIT_BENCH_ACTION.setCells,
        payload: { batteryId: PART_ID.battery, cells: cells + (command === "cells:add" ? 1 : -1) },
      });
    } else if (command === "switch:toggle") {
      const key = circuit().components.find((part) => part.id === PART_ID.key);
      dispatch({ type: CIRCUIT_BENCH_ACTION.setSwitch, payload: { switchId: PART_ID.key, closed: !(key?.kind === "switch" && key.closed) } });
    } else if (command.startsWith("load:")) {
      const action = swapLoadAction(circuit(), command.slice("load:".length));
      if (action) dispatch(action);
    } else if (command === "reading:record") {
      const load = circuit().components.find((part) => part.kind === "resistor" || part.kind === "bulb");
      const before = bench.readings.length;
      dispatch({
        type: CIRCUIT_BENCH_ACTION.recordReading,
        payload: { ammeterId: PART_ID.ammeter, voltmeterId: PART_ID.voltmeter, loadId: load?.id ?? "" },
      });
      const readings = store.getState().bench.readings;
      const added = readings[readings.length - 1];
      if (readings.length > before && added) {
        notice = `Reading ${readings.length} recorded: ${added.volts.toFixed(2)} V and ${added.amps.toFixed(2)} A.`;
      }
    } else if (command === "readings:clear") {
      dispatch({ type: CIRCUIT_BENCH_ACTION.clearReadings, payload: null });
    } else if (command === "circuit:reset") {
      tool = null;
      dispatch({ type: CIRCUIT_BENCH_ACTION.reset, payload: null });
    } else {
      if (command === "lesson:hint") {
        const mission = manifest.missions.find((item) => item.id === state.activeMissionId);
        const used = state.activeMissionId ? state.missionProgress[state.activeMissionId]?.hintsUsed ?? 0 : 0;
        lastHintText = mission?.hints[used] ?? "";
      }
      const previousMission = state.activeMissionId;
      const action = lessonCommandToAction(command, () => ohmsLawCheckState(store.getState().bench));
      if (action) dispatch(action);
      if (store.getState().activeMissionId !== previousMission) lastHintText = "";
    }
    render();
  };

  const onClick = (event: MouseEvent): void => {
    const command = (event.target as Element | null)?.closest<HTMLElement>("[data-command]")?.dataset.command;
    if (command) runCommand(command);
  };

  const onInput = (action: InputAction): void => {
    const payload = (typeof action.payload === "object" && action.payload !== null && !Array.isArray(action.payload)
      ? action.payload
      : {}) as Record<string, unknown>;
    if (action.type === "rotate" && typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
      if (xrActive) renderer.rotateArView(payload.deltaX, payload.deltaY);
      else renderer.rotate(payload.deltaX, payload.deltaY);
    } else if (action.type === "scale" && typeof payload.delta === "number") {
      if (xrActive) renderer.scaleArView(payload.delta);
      else renderer.scale(payload.delta);
    } else if (action.type === "back") {
      renderer.resetView();
    }
  };

  const input = new ScreenInputAdapter({
    root: page,
    dispatch: onInput,
    pickTarget: (x, y, source, pointerType) => renderer.pickTarget(x, y, source, pointerType),
    touch: {
      pinchSensitivity: screenZoomConfig.pinchSensitivity,
      pinchDeadZonePx: arTouchGestureConfig.pinchDeadZonePx,
      dragThresholdPx: arTouchGestureConfig.dragThresholdPx,
      // Panels scroll and spot buttons tap; only the bare model turns.
      shouldIgnoreTarget: (target) =>
        !(target instanceof Element) || !sceneHost.contains(target) || target.closest("button") !== null,
    },
  });

  // --- AR and VR --------------------------------------------------------------
  const questionElement = lessonPanel.element.querySelector<HTMLElement>(".mma-question");
  const hud = createArHud({
    host: page,
    tabs: [
      { id: "mission", label: "Mission", icon: ICON.mission, sections: [lessonPanel.element] },
      { id: "circuit", label: "Circuit", icon: ICON.circuit, sections: [slot<HTMLElement>("bench")] },
      { id: "readings", label: "Readings", icon: ICON.readings, sections: [slot<HTMLElement>("readings")] },
      { id: "sound", label: "Sound", icon: ICON.sound, sections: [narrationBar.element] },
    ],
    caption: narrationBar.caption,
    live: [statusLine],
    tip: "Choose a meter, then tap a ring to place it. Pinch to resize.",
    status: () => {
      const view = buildLessonView(store.getState(), manifest.missions, assessmentItems, lastHintText, LESSON_COPY);
      return store.getState().mode === "free-play" ? "Free play" : arHudStatusText(view.eyebrow, view.title, false);
    },
    statusSources: [lessonPanel.element],
    missionSignals: [lessonPanel.element],
    ...(questionElement ? { question: questionElement } : {}),
    onResetView: () => renderer.resetArView(),
  });
  const disposeXrSession = mountArControls({
    root: page,
    entryHost: slot<HTMLElement>("xr-entry"),
    dialogHost: page,
    subject: "the circuit",
    hud,
    renderer,
    telemetryContext,
    clock: () => new Date().toISOString(),
    idGenerator,
    getActiveMissionId: () => store.getState().activeMissionId,
    publishComfortBreakShown: (missionId) => {
      const event = telemetryEventSchema.parse({
        ...telemetryContext,
        eventId: idGenerator(),
        ts: new Date().toISOString(),
        type: "comfort_break_shown",
        payload: { missionId },
        device: { ...telemetryContext.device, mode: xrExitLabel === "Exit VR" ? "vr" : "ar" },
      });
      store.events.emit("comfort_break_shown", event as LearningEventMap["comfort_break_shown"]);
    },
    recordLocalEvent: () => undefined,
    onSpatialActiveChange: (active, info) => {
      xrActive = active;
      // Headsets and the emulator (no DOM overlay) use in-scene panels; phones use the HUD.
      xrPanels = active && info.overlayGranted !== true;
      page.classList.toggle("ohm--xr-panels", xrPanels);
      xrExitLabel = info.mode === "immersive-vr" ? "Exit VR" : "Exit AR";
      // Phone AR keeps touch on the page overlay; headsets and the emulator use IWSDK input.
      input.setEnabled(!active || info.overlayGranted === true);
      if (!xrPanels) renderer.hideLessonPanels();
      render();
    },
  });

  /** Update the headset / emulator panels, including narration controls and caption. */
  function refreshPanels(): void {
    const state = store.getState();
    const labels = narrationButtonLabels(narrationView ?? {
      audioEnabled: false,
      settings: { muted: false, speed: 1, captionsEnabled: true, soundEnabled: false },
    });
    const content = buildXrPanelsContent(
      buildLessonView(state, manifest.missions, assessmentItems, lastHintText, LESSON_COPY),
      {
        bench: buildBenchView(state.bench, solution, notice),
        readings: state.bench.readings as Parameters<typeof readingRows>[0],
        tool,
        spots,
      },
      xrExitLabel,
    );
    renderer.setModulePanels({
      ...content,
      narration: {
        caption: narrationView?.settings.captionsEnabled ? narrationView.captionText : "",
        sound: { label: labels.sound, command: NARRATION_COMMAND.sound },
        captions: { label: labels.captions, command: NARRATION_COMMAND.captions },
        replay: { label: labels.replay, command: NARRATION_COMMAND.replay },
      },
    }, runCommand);
  }

  function render(): void {
    const state = store.getState();
    const current = circuit();
    solution = solveCircuit(current);
    layout = layoutSeriesLoop(current);
    if (layout) {
      circuitView.update(toSceneFrame(layout, current, solution, motion?.matches ?? false));
      renderer.contentChanged();
      if (!fitted) {
        fitted = true;
        const { width, height } = layout;
        // Fit the height too: on a wide stage the circuit's height is what limits it.
        renderer.ready
          .then(() => {
            const bounds = sceneHost.getBoundingClientRect();
            const aspect = bounds.height > 0 ? bounds.width / bounds.height : 1;
            renderer.fitToWidth(Math.max(width, height * aspect));
          })
          .catch(() => undefined);
      }
      // Phone AR is a small, moving view: show only the readings there too.
      labels = sceneLabels(layout, current, solution, xrActive || (compactLabels?.matches ?? false));
      spots = tool ? meterSpots(layout, current, tool) : [];
    }

    lessonPanel.update(buildLessonView(state, manifest.missions, assessmentItems, lastHintText, LESSON_COPY));
    const bench = buildBenchView(state.bench, solution, notice);
    setText(statusLine, bench.status.text);
    statusLine.dataset.tone = bench.status.tone;
    statusLine.hidden = bench.status.text === "";
    setText(batteryOutput, bench.batteryText);
    removeCell.disabled = bench.cells <= 1;
    addCell.disabled = bench.cells >= bench.maxCells;
    setText(switchButton, bench.switchClosed ? "Open the switch" : "Close the switch");
    switchButton.setAttribute("aria-pressed", String(bench.switchClosed));
    setText(ammeterOutput, bench.ammeterText);
    setText(voltmeterOutput, bench.voltmeterText);
    for (const button of loadsRow.querySelectorAll<HTMLButtonElement>("[data-command^='load:']")) {
      button.setAttribute("aria-pressed", String(button.dataset.command === `load:${bench.loadId}`));
    }
    for (const button of page.querySelectorAll<HTMLButtonElement>(".ohm-tool")) {
      button.setAttribute("aria-pressed", String(button.dataset.command === `tool:${tool}`));
    }
    renderSpotList();
    renderLabels();
    renderSpots();
    table.update(readingRows(state.bench.readings as Parameters<typeof readingRows>[0]));
    graph.update(graphData(state.bench.readings as Parameters<typeof graphData>[0]));
    if (xrPanels) refreshPanels();
  }

  function renderSpotList(): void {
    setText(spotHelp, tool ? `Where should the ${tool} go? Choose a place here or in the model.` : "Choose a meter, then choose where to connect it.");
    spotList.replaceChildren(...spots.map((spot) => {
      const button = el(document, "button", "mma-button mma-button--option ohm-spot-option", spot.current ? `${spot.label} (here now)` : spot.label);
      button.type = "button";
      button.dataset.command = `meter:place:${spot.key}`;
      button.disabled = spot.current;
      return button;
    }));
  }

  function renderLabels(): void {
    sync(labelElements, labelsLayer, labels.map((label) => label.id), () => el(document, "span", "ohm-label"));
    for (const label of labels) {
      const element = labelElements.get(label.id)!;
      setText(element, label.text);
      element.dataset.tone = label.tone;
    }
  }

  function renderSpots(): void {
    sync(spotElements, spotsLayer, spots.filter((spot) => !spot.current).map((spot) => spot.key), (key) => {
      const button = el(document, "button", "ohm-spot");
      button.type = "button";
      button.dataset.command = `meter:place:${key}`;
      return button;
    });
    for (const spot of spots) {
      const button = spotElements.get(spot.key);
      if (!button) continue;
      button.setAttribute("aria-label", `Place the ${tool ?? "meter"}: ${spot.label}`);
      button.title = spot.label;
    }
  }

  function sync<Item extends HTMLElement>(
    map: Map<string, Item>,
    parent: HTMLElement,
    keys: readonly string[],
    create: (key: string) => Item,
  ): void {
    for (const [key, element] of map) {
      if (!keys.includes(key)) {
        element.remove();
        map.delete(key);
      }
    }
    for (const key of keys) {
      if (!map.has(key)) {
        const element = create(key);
        parent.append(element);
        map.set(key, element);
      }
    }
  }

  /** Keep labels and spot buttons on their parts as the model turns and zooms. */
  function placeOverlays(): void {
    const place = (
      element: HTMLElement | undefined,
      point: Parameters<typeof renderer.projectContentPoint>[0],
      shift: string,
    ): void => {
      if (!element) return;
      const projected = renderer.projectContentPoint(point);
      element.hidden = !projected?.visible;
      if (projected) element.style.transform = `translate(${projected.x}px, ${projected.y}px) ${shift}`;
    };
    for (const label of labels) place(labelElements.get(label.id), label.anchor, LABEL_SHIFT[label.side]);
    for (const spot of spots) place(spotElements.get(spot.key), spot.position, "translate(-50%, -50%)");
  }

  // The circuit view moves its own charges each time it is drawn; this keeps the page
  // labels and meter rings on their parts.
  const tick = (): void => {
    placeOverlays();
    frame = requestAnimationFrame(tick);
  };

  const exitButton = page.querySelector<HTMLButtonElement>("[data-app-action='exit']")!;
  const onExit = (): void => options.onExit?.();
  if (options.onExit) {
    exitButton.hidden = false;
    exitButton.addEventListener("click", onExit);
  }
  /** Redraw when reduced motion or the narrow layout switches on or off. */
  const onMotionChange = (): void => render();
  motion?.addEventListener("change", onMotionChange);
  compactLabels?.addEventListener("change", onMotionChange);
  page.addEventListener("click", onClick);
  renderer.ready.catch((error: unknown) => {
    console.error("The 3D scene could not start; the lesson controls keep working.", error);
  });

  store.events.emit("module_started", { type: "module_started", payload: { moduleId: manifest.id } });
  dispatch({ type: "mission/start", payload: { missionId: manifest.missions[0]?.id ?? "" } });
  render();
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    input.dispose();
    disposeZoom();
    motion?.removeEventListener("change", onMotionChange);
    compactLabels?.removeEventListener("change", onMotionChange);
    page.removeEventListener("click", onClick);
    exitButton.removeEventListener("click", onExit);
    narrationPlayer.dispose();
    void disposeXrSession().finally(() => {
      hud.dispose();
      narrationBar.dispose();
      renderer.dispose();
    });
    root.replaceChildren();
  };
}
