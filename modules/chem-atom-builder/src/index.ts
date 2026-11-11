import {
  createStore,
  createIdGenerator,
  type EngineAction,
  type LearningEventMap,
  type TelemetryContext,
} from "@mma/engine-core";
import {
  assessmentItemSchema,
  resolveTriggeredAssessmentItems,
  type AssessmentItem,
} from "@mma/engine-assess";
import { lessonCommandToAction } from "@mma/engine-lesson";
import {
  calculateCharge,
  calculateMassNumber,
  bohrBuryConfiguration,
  elementByAtomicNumber,
  hasCompleteOuterShell,
} from "@mma/kit-chemistry";
import {
  ScreenInputAdapter,
  SceneRenderer,
  XR_COMMAND,
  arTouchGestureConfig,
  installZoomControls,
  screenZoomConfig,
  type InputAction,
  type WorldOptions,
} from "@mma/engine-render";
import {
  NarrationPlayer,
  createNarrationAssetLoader,
  publishNarrationTelemetry,
} from "@mma/engine-voice";
import {
  arHudStatusText,
  createArHud,
  createNarrationBar,
  mountArControls,
} from "@mma/engine-ui";
import "@mma/engine-ui/xr-hud.css";
import { telemetryEventSchema } from "@mma/schema";
import carbon12Items from "../assessments/m1-carbon-12.json";
import sodiumItems from "../assessments/m2-sodium-ion.json";
import carbon14Items from "../assessments/m3-carbon-14.json";
import chlorideItems from "../assessments/m4-chloride-ion.json";
import { manifest } from "./manifest.js";
import {
  createAtomBuilderLearningReducer,
  createAtomBuilderLearningState,
  missionCheckState,
  projectAtomBuilderLearningEvents,
  type AtomBuilderLearningState,
} from "./learning.js";
import { layoutAtom } from "./layout.js";
import { outerShellState, withOuterShellEmphasis } from "./outer-shell.js";
import { NARRATION_COMMAND, buildXrLessonContent, toModulePanelsContent } from "./xr-lesson.js";
import "./atom-builder.css";
import "./ar-hud.css";
import "./atom-builder-cosmic.css";

/** Icons for the phone AR HUD tabs (24x24 stroke paths). */
const HUD_ICONS = {
  mission: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
  build: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
  element: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 15V9l3 4 3-4v6"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
} as const;

interface LocalEventEntry {
  readonly type: string;
  readonly timestamp: string;
  readonly missionId: string;
}
const narrationAudioUrls = {
  ...import.meta.glob("../narration/en/generated/*.mp3", {
    eager: true,
    import: "default",
  }),
  ...import.meta.glob("../narration/en/generated/*.wav.gz", {
    eager: true,
    query: "?inline",
    import: "default",
  }),
  ...(import.meta.env.DEV
    ? import.meta.glob("../narration/en/generated/audible-test/*.wav.gz", {
        eager: true,
        query: "?inline",
        import: "default",
      })
    : {}),
} as Record<string, string>;
const narrationCaptionFiles = import.meta.glob("../narration/en/generated/*.vtt", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** Validated manifest for the screen-mode Atom Builder module. */
export { manifest };
const assessmentItems: readonly AssessmentItem[] = [
  ...carbon12Items,
  ...sodiumItems,
  ...carbon14Items,
  ...chlorideItems,
].map((item) => assessmentItemSchema.parse(item));
const assessmentsById = new Map(assessmentItems.map((item) => [item.id, item]));
/** Mount-time options for the screen module. */
export interface AtomBuilderOptions {
  readonly diagnostics?: boolean;
  /** IWSDK project options (`virtual:iwsdk-project`); renderer defaults are used when omitted. */
  readonly worldOptions?: WorldOptions;
  /**
   * Called when the student presses "Experiments". The host app decides where to go;
   * when omitted the button is hidden.
   */
  readonly onExit?: () => void;
}

/** Mount the Class 9-10 atom builder and return its complete teardown. */
export function mountAtomBuilder(root: HTMLElement, options: AtomBuilderOptions = {}): () => void {
  root.innerHTML = `
    <section class="atom-builder" aria-label="Atom Builder" tabindex="0">
      <header class="builder-header">
        <div class="builder-brand">
          <button class="back-to-experiments" type="button" data-app-action="exit" aria-label="Back to all experiments" hidden>&larr; Universe</button>
          <span class="brand-mark" aria-hidden="true">M</span><span>Math Maam Academy</span>
        </div>
        <div class="builder-title"><span class="eyebrow" data-grade="Class 9-10" aria-label="Chemistry, Class 9-10">CHEMISTRY</span><h1>Atom Builder</h1></div>
        <button class="reset-atom" type="button" data-command="atom/reset">Reset atom</button>
      </header>
      <section class="lesson-panel" id="lesson-panel" aria-label="Mission">
        <div class="lesson-copy">
          <p class="lesson-step" id="mission-step">Mission 1 of 4</p>
          <h2 id="mission-title">Build carbon-12</h2>
          <p id="mission-goal">Build a neutral carbon atom with 6 protons, 6 neutrons, and 6 electrons.</p>
          <p class="mission-progress" id="mission-progress">Progress 0/4</p>
        <div class="lesson-controls">
          <button type="button" data-command="lesson:hint">Hint</button>
          <button type="button" data-command="lesson:check">Check</button>

          <button type="button" data-command="lesson:free-play">Free play</button>
        </div>
        <p class="hint-feedback" id="hint-feedback" aria-live="polite"></p>
        <p class="mission-feedback" id="mission-feedback" aria-live="polite"></p>
      </section>
      <div data-narration-slot hidden></div>
      <section class="assessment-card" id="assessment-card" aria-label="Question" hidden>
        <p class="lesson-step" id="assessment-step"></p>
        <h2 id="assessment-prompt"></h2>
        <div class="assessment-options" id="assessment-options"></div>
        <p class="assessment-feedback" id="assessment-feedback" aria-live="polite"></p>
        <button class="assessment-continue" id="assessment-continue" type="button" data-command="lesson:assessment:continue" hidden>Next question</button>
      </section>
      <section class="lesson-summary" id="lesson-summary" aria-live="polite" hidden>
        <h2>Lesson complete</h2>
        <p id="lesson-summary-details"></p>
      </section>
      <p class="free-play-status" id="free-play-status" hidden>Free play</p>
      <div class="builder-content">
        <aside class="particle-rail" aria-label="Particles">
          <div class="rail-heading"><span>BUILDING BLOCKS</span><span class="rail-rule"></span></div>
          <div class="particle-row proton-row">
            <button class="tray-particle proton-dot" type="button" data-particle="proton" aria-label="Drag proton" title="Proton"></button>
            <div class="particle-label"><strong>Proton</strong><span id="proton-count">0</span></div>
            <div class="stepper"><button type="button" data-command="particle:remove:proton" aria-label="Remove proton">-</button><button type="button" data-command="particle:add:proton" aria-label="Add proton">+</button></div>
          </div>
          <div class="particle-row neutron-row">
            <button class="tray-particle neutron-dot" type="button" data-particle="neutron" aria-label="Drag neutron" title="Neutron"></button>
            <div class="particle-label"><strong>Neutron</strong><span id="neutron-count">0</span></div>
            <div class="stepper"><button type="button" data-command="particle:remove:neutron" aria-label="Remove neutron">-</button><button type="button" data-command="particle:add:neutron" aria-label="Add neutron">+</button></div>
          </div>
          <div class="particle-row electron-row">
            <button class="tray-particle electron-dot" type="button" data-particle="electron" aria-label="Drag electron" title="Electron"></button>
            <div class="particle-label"><strong>Electron</strong><span id="electron-count">0</span></div>
            <div class="stepper"><button type="button" data-command="particle:remove:electron" aria-label="Remove electron">-</button><button type="button" data-command="particle:add:electron" aria-label="Add electron">+</button></div>
          </div>
          <div class="rail-footer"><span class="color-key proton-key"></span>Proton<span class="color-key neutron-key"></span>Neutron<span class="color-key electron-key"></span>Electron</div>
        </aside>
        <section class="atom-workspace" aria-label="Atom model and properties">
          <div class="scene-heading"><span>INSIDE THE ATOM</span><button type="button" class="reset-view" data-command="reset-view">Reset view</button></div>
          <div class="scene-viewport" id="atom-scene"></div>
          <output class="chemistry-feedback" id="chemistry-feedback" aria-live="polite"></output>
        </section>
        <aside class="atom-inspector" aria-label="Atom properties">
          <div class="element-summary"><span class="element-symbol" id="element-symbol"></span><div><h2 id="element-name" data-empty-label="No element yet">No element yet</h2><span id="element-number"></span></div></div>
          <dl class="property-list">
            <div><dt>Atomic number <span>Z</span></dt><dd id="atomic-number">1</dd></div>
            <div><dt>Mass number <span>A</span></dt><dd id="mass-number">1</dd></div>
            <div><dt>Charge</dt><dd id="atom-charge">0</dd></div>
            <div><dt>Electron configuration</dt><dd id="electron-configuration">1</dd></div>
            <div><dt>Outer shell</dt><dd id="outer-shell">Incomplete</dd></div>
          </dl>
          <div class="inspector-foot"><span class="live-indicator"></span>LIVE SCAN</div>
        </aside>
      </div>
      <div class="drag-ghost" id="drag-ghost" aria-hidden="true"></div>
      <button class="dev-events-toggle" id="dev-events-toggle" type="button" data-dev-events-action="toggle" aria-expanded="false" hidden>Events</button>
      <aside class="dev-event-panel" id="dev-event-panel" aria-label="Recent local events" hidden>
        <header class="dev-event-header"><h2>Local events</h2><button type="button" data-dev-events-action="close">Close</button></header>
        <ol id="dev-event-list"></ol>
      </aside>
    </section>
  `;

  const sceneHost = requiredElement<HTMLElement>(root, "#atom-scene");
  const feedback = requiredElement<HTMLOutputElement>(root, "#chemistry-feedback");
  const ghost = requiredElement<HTMLElement>(root, "#drag-ghost");
  // Shared narration bar, placed where the Atom Builder always had it.
  const narrationBar = createNarrationBar({
    enableSound: () => void narrationPlayer.enableSound(),
    toggleMuted: () => narrationPlayer.toggleMuted(),
    replay: () => narrationPlayer.replayLastCue(),
    toggleCaptions: () => narrationPlayer.toggleCaptions(),
    setSpeed: (speed) => narrationPlayer.setSpeed(speed),
  });
  requiredElement<HTMLElement>(root, "[data-narration-slot]").replaceWith(narrationBar.element);
  // Desktop and phones keep the website layout: IWSDK renders the atom inside the
  // scene viewport. The Horizon UI panels appear only inside AR/VR sessions.
  const renderer = new SceneRenderer({
    host: sceneHost,
    // Glowing nucleus, rings of light and orbiting electrons (Ionic Bonding keeps the classic atom).
    atomStyle: "luminous",
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    ...(options.worldOptions === undefined ? {} : { worldOptions: options.worldOptions }),
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
  });
  renderer.ready.catch((error: unknown) => {
    console.error("The 3D scene could not start; lesson controls keep working.", error);
  });
  let input: ScreenInputAdapter | null = null;
  let xrSessionActive = false;
  let xrLessonVisible = false;
  let xrExitLabel = "Exit AR";
  let narrationCaption = "";
  let narrationView = { audioEnabled: false, muted: false, captionsEnabled: true };
  let refreshXrLesson: () => void = () => undefined;
  let onXrCommand: (command: string) => void = () => undefined;
  const disposeZoomControls = installZoomControls(
    sceneHost,
    () => renderer.getDistance(),
    (distance) => renderer.setDistance(distance),
    screenZoomConfig,
    () => !xrSessionActive,
  );
  const reducer = createAtomBuilderLearningReducer(manifest.missions, assessmentItems);
  const idGenerator = createIdGenerator({
    crypto: globalThis.crypto,
    now: Date.now,
  });
  const telemetryContext = {
    studentRef: idGenerator(),
    sessionId: idGenerator(),
    moduleId: manifest.id,
    moduleVersion: "0.0.0",
    device: { mode: "screen", tier: "mid" },
  } satisfies TelemetryContext;
  const clock = (): string => new Date().toISOString();
  const store = createStore(reducer, createAtomBuilderLearningState(manifest.missions), {
    telemetry: {
      context: telemetryContext,
      clock,
      idGenerator,
      projectEvents: (action, previousState, nextState) =>
        projectAtomBuilderLearningEvents(manifest.missions, action, previousState, nextState),
    },
  });
  let activeParticle: string | null = null;
  let lastHintText = "";
  const localEvents: LocalEventEntry[] = [];
  const recordLocalEvent = (event: LearningEventMap[keyof LearningEventMap]): void => {
    const payload = event.payload as { readonly missionId?: unknown; readonly cueId?: unknown };
    const narrationCue = typeof payload.cueId === "string"
      ? manifest.narration?.cues.find((cue) => cue.id === payload.cueId)
      : undefined;
    localEvents.push({
      type: event.type,
      timestamp: "ts" in event && typeof event.ts === "string" ? event.ts : clock(),
      missionId: typeof payload.missionId === "string"
        ? payload.missionId
        : narrationCue?.missionId ?? "-",
    });
    renderLocalEvents();
  };
  function renderLocalEvents(): void {
    const list = requiredElement<HTMLOListElement>(root, "#dev-event-list");
    list.replaceChildren(...localEvents.slice(-20).reverse().map((event) => {
      const entry = document.createElement("li");
      entry.dataset.eventType = event.type;
      const time = document.createElement("time");
      time.dateTime = event.timestamp;
      time.textContent = new Date(event.timestamp).toLocaleTimeString();
      const type = document.createElement("span");
      type.className = "dev-event-type";
      type.textContent = event.type;
      const mission = document.createElement("span");
      mission.className = "dev-event-mission";
      mission.textContent = event.missionId;
      entry.append(time, type, mission);
      return entry;
    }));
  }
  const recordLocalArEvent = (type: string, timestamp: string, detail: string): void => {
    localEvents.push({ type, timestamp, missionId: detail });
    renderLocalEvents();
  };
  store.events.subscribe("mission_started", recordLocalEvent);
  store.events.subscribe("mission_completed", recordLocalEvent);
  store.events.subscribe("hint_used", recordLocalEvent);
  store.events.subscribe("assessment_answered", recordLocalEvent);
  store.events.subscribe("comfort_break_shown", recordLocalEvent);
  store.events.subscribe("module_started", recordLocalEvent);
  store.events.subscribe("invalid_placement", recordLocalEvent);
  store.events.subscribe("idle", recordLocalEvent);
  store.events.subscribe("narration_played", recordLocalEvent);
  store.events.subscribe("narration_skipped", recordLocalEvent);
  store.events.subscribe("voice_fallback_used", recordLocalEvent);
  const onLocalTelemetry = (event: Event): void => {
    const telemetry = telemetryEventSchema.parse((event as CustomEvent<unknown>).detail);
    const payload = telemetry.payload;
    const duration = typeof payload.durationSec === "number"
      ? `${payload.durationSec.toFixed(1)}s`
      : "";
    const reason = typeof payload.errorReasonCode === "string"
      ? payload.errorReasonCode
      : "";
    localEvents.push({
      type: telemetry.type,
      timestamp: telemetry.ts,
      missionId: [reason, duration].filter(Boolean).join(" · ") || "-",
    });
    renderLocalEvents();
  };
  const eventsToggle = requiredElement<HTMLButtonElement>(root, "#dev-events-toggle");
  const eventsPanel = requiredElement<HTMLElement>(root, "#dev-event-panel");
  const setEventsPanelOpen = (open: boolean): void => {
    eventsPanel.hidden = !open;
    eventsToggle.setAttribute("aria-expanded", String(open));
  };
  const onEventsAction = (event: MouseEvent): void => {
    const action = (event.target as Element | null)?.closest<HTMLElement>("[data-dev-events-action]")?.dataset.devEventsAction;
    if (action === "toggle") {
      setEventsPanelOpen(eventsPanel.hidden === true);
    } else if (action === "close") {
      setEventsPanelOpen(false);
    }
  };
  eventsToggle.hidden = !options.diagnostics;
  root.addEventListener("click", onEventsAction);
  root.addEventListener("mma:local-telemetry", onLocalTelemetry);

  const hud = createArHud({
    host: requiredElement<HTMLElement>(root, ".atom-builder"),
    tabs: [
      { id: "mission", label: "Mission", icon: HUD_ICONS.mission, sections: ["#lesson-panel", "#assessment-card", "#lesson-summary", "#free-play-status"].map((selector) => requiredElement<HTMLElement>(root, selector)) },
      { id: "build", label: "Build", icon: HUD_ICONS.build, sections: [requiredElement<HTMLElement>(root, ".particle-rail")] },
      { id: "element", label: "Element", icon: HUD_ICONS.element, sections: [requiredElement<HTMLElement>(root, ".atom-inspector")] },
      { id: "sound", label: "Sound", icon: HUD_ICONS.sound, sections: [narrationBar.element] },
    ],
    caption: narrationBar.caption,
    tip: "Pinch to resize. Drag to turn the atom.",
    status: () => arHudStatusText(
      requiredElement<HTMLElement>(root, "#mission-step").textContent ?? "",
      requiredElement<HTMLElement>(root, "#mission-title").textContent ?? "",
      !requiredElement<HTMLElement>(root, "#free-play-status").hidden,
    ),
    statusSources: ["#mission-step", "#mission-title", "#free-play-status"].map((selector) => requiredElement<HTMLElement>(root, selector)),
    missionSignals: ["#mission-feedback", "#hint-feedback", "#assessment-card", "#lesson-summary"].map((selector) => requiredElement<HTMLElement>(root, selector)),
    question: requiredElement<HTMLElement>(root, "#assessment-card"),
    onResetView: () => renderer.resetArView(),
  });
  const disposeArControls = mountArControls({
    root,
    entryHost: requiredElement<HTMLElement>(root, ".scene-heading"),
    dialogHost: requiredElement<HTMLElement>(root, ".atom-builder"),
    subject: "the atom",
    hud,
    renderer,
    telemetryContext,
    clock,
    idGenerator,
    getActiveMissionId: () => store.getState().activeMissionId,
    publishComfortBreakShown: (missionId) => {
      const event = telemetryEventSchema.parse({
        ...telemetryContext,
        eventId: idGenerator(),
        ts: clock(),
        type: "comfort_break_shown",
        payload: { missionId },
        device: { ...telemetryContext.device, mode: "ar" },
      });
      store.events.emit(
        "comfort_break_shown",
        event as LearningEventMap["comfort_break_shown"],
      );
    },
    recordLocalEvent: recordLocalArEvent,
    onSpatialActiveChange: (active, sessionInfo) => {
      xrSessionActive = active;
      // Phone AR (DOM overlay) keeps touch input for pinch and turn gestures;
      // headsets use IWSDK input instead.
      input?.setEnabled(!active || sessionInfo.overlayGranted === true);
      root.classList.toggle("xr-session-active", active);
      root.classList.toggle(
        "xr-vr-active",
        active && sessionInfo.mode === "immersive-vr",
      );
      xrExitLabel = sessionInfo.mode === "immersive-vr" ? "Exit VR" : "Exit AR";
      // Headsets get the Horizon UI panels in the scene; phones keep the DOM overlay,
      // so in AR the panels appear only when the overlay was not granted.
      xrLessonVisible = active && (sessionInfo.mode === "immersive-vr" || sessionInfo.overlayGranted === false);
      if (xrLessonVisible) refreshXrLesson();
      else renderer.hideLessonPanels();
    },
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
  });

  const narrationPlayer = new NarrationPlayer({
    cues: manifest.narration?.cues ?? [],
    events: store.events,
    moduleId: manifest.id,
    activityTarget: root,
    ...createNarrationAssetLoader({
      audioUrls: narrationAudioUrls,
      captions: narrationCaptionFiles,
      audibleTest: import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get("narrationAudio") === "audible-test",
    }),
    onViewChange: (state) => {
      narrationBar.update(state);
      narrationCaption = state.settings.captionsEnabled ? state.captionText : "";
      narrationView = {
        audioEnabled: state.audioEnabled,
        muted: state.settings.muted,
        captionsEnabled: state.settings.captionsEnabled,
      };
      refreshXrLesson();
    },
    onTelemetry: (event) => publishNarrationTelemetry(event, store.events, telemetryContext, clock, idGenerator),
  });
  const entryButton = (mode: "immersive-ar" | "immersive-vr") =>
    root.querySelector<HTMLButtonElement>(`.ar-start[data-session-mode='${mode}']`);
  const xrLessonContent = () => buildXrLessonContent(store.getState(), manifest.missions, assessmentItems, {
    lastHintText,
    caption: narrationCaption,
    exitLabel: xrExitLabel,
    session: {
      inXr: xrSessionActive,
      canEnterVr: entryButton("immersive-vr")?.hidden === false,
      canEnterAr: entryButton("immersive-ar")?.hidden === false,
    },
    narration: narrationView,
  });
  refreshXrLesson = () => {
    if (xrLessonVisible) renderer.setModulePanels(toModulePanelsContent(xrLessonContent()), (command) => onXrCommand(command));
  };
  onXrCommand = (command) => {
    if (command === XR_COMMAND.exit) {
      root.querySelector<HTMLButtonElement>("[data-ar-action='exit']")?.click();
    } else if (command === XR_COMMAND.recenter) {
      renderer.recenter();
    } else if (command === XR_COMMAND.enterVr) {
      entryButton("immersive-vr")?.click();
    } else if (command === XR_COMMAND.enterAr) {
      entryButton("immersive-ar")?.click();
    } else if (command === NARRATION_COMMAND.sound) {
      if (!narrationView.audioEnabled) void narrationPlayer.enableSound();
      else narrationPlayer.toggleMuted();
    } else if (command === NARRATION_COMMAND.captions) {
      narrationPlayer.toggleCaptions();
    } else if (command === NARRATION_COMMAND.replay) {
      narrationPlayer.replayLastCue();
    } else {
      runCommand(command);
    }
  };


  const renderState = (state: Readonly<AtomBuilderLearningState>): void => {
    const chemistry = state.chemistry;
    const element = elementByAtomicNumber(chemistry.protons);
    const electrons = chemistry.shells.reduce((sum, count) => sum + count, 0);
    setText(root, "#proton-count", String(chemistry.protons));
    setText(root, "#neutron-count", String(chemistry.neutrons));
    setText(root, "#electron-count", String(electrons));
    setText(root, "#element-symbol", element?.symbol ?? "");
    setText(
      root,
      "#element-name",
      element?.name ?? requiredElement<HTMLElement>(root, "#element-name").dataset.emptyLabel ?? "",
    );
    setText(root, "#element-number", element ? `ELEMENT ${String(element.atomicNumber).padStart(2, "0")}` : "");
    setText(root, "#atomic-number", String(chemistry.protons));
    setText(root, "#mass-number", String(calculateMassNumber(chemistry.protons, chemistry.neutrons)));
    setText(root, "#atom-charge", formatCharge(calculateCharge(chemistry.protons, electrons)));
    setText(root, "#electron-configuration", chemistry.shells.join(",") || "0");
    setText(root, "#outer-shell", hasCompleteOuterShell(chemistry.shells) ? "Complete" : "Incomplete");
    feedback.textContent = chemistry.validationMessages[0] ?? "";
    feedback.classList.toggle("is-visible", chemistry.validationMessages.length > 0);
    renderer.update(withOuterShellEmphasis(layoutAtom(chemistry), chemistry.shells));
    // The light behind the atom follows the outer shell: dim, restless violet, or calm cyan.
    sceneHost.dataset.outerShell = outerShellState(chemistry.shells);
    renderLearningState(root, state, assessmentItems, assessmentsById, lastHintText);
    refreshXrLesson();
  };

  const dispatchLearningAction = (action: EngineAction): void => {
    store.dispatch(action);
    if (action.type === "particle/place") {
      const message = store.getState().chemistry.validationMessages[0];
      const payload = asPayload(action.payload);
      const particle = payload.particle;
      if (
        message &&
        (particle === "proton" || particle === "neutron" || particle === "electron") &&
        (payload.target === "shell" || payload.target === "nucleus")
      ) {
        const target = payload.target === "shell"
          ? `shell:${payload.shell ?? 0}`
          : "nucleus";
        store.events.emit("invalid_placement", {
          type: "invalid_placement",
          payload: {
            missionId: store.getState().activeMissionId,
            particle,
            target,
          },
        });
      }
    }
  };

  const runCommand = (command: string): void => {
    const previousMissionId = store.getState().activeMissionId;
    if (command === "lesson:hint") {
      const state = store.getState();
      const mission = manifest.missions.find((item) => item.id === state.activeMissionId);
      const used = state.activeMissionId ? state.missionProgress[state.activeMissionId]?.hintsUsed ?? 0 : 0;
      lastHintText = mission?.hints[used] ?? "No more hints for this mission.";
    }
    applyCommand(command, store.getState(), dispatchLearningAction, renderer);
    if (store.getState().activeMissionId !== previousMissionId) {
      lastHintText = "";
    }
    renderState(store.getState());
  };
  const onCommandClick = (event: MouseEvent): void => {
    const command = (event.target as Element | null)
      ?.closest<HTMLElement>("[data-command]")
      ?.dataset.command;
    if (typeof command !== "string" || command.length === 0) return;
    runCommand(command);
  };

  const onInput = (action: InputAction): void => {
    const payload = asPayload(action.payload);
    switch (action.type) {
      case "grab": {
        activeParticle = typeof payload.source === "string" ? payload.source : null;
        if (activeParticle?.startsWith("tray:")) {
          renderer.beginDrag(activeParticle.replace("tray:", ""));
        }
        ghost.textContent = activeParticle?.replace("tray:", "") ?? "";
        ghost.classList.toggle("is-visible", activeParticle !== null);
        break;
      }
      case "move": {
        if (
          root.classList.contains("ar-active")
          && payload.source === "xr-controller"
          && typeof payload.deltaX === "number"
          && typeof payload.deltaY === "number"
        ) {
          renderer.moveArView(payload.deltaX, payload.deltaY);
          break;
        }
        if (ghost.classList.contains("is-visible") && typeof payload.x === "number" && typeof payload.y === "number") {
          const bounds = root.getBoundingClientRect();
          ghost.style.left = `${payload.x - bounds.left}px`;
          ghost.style.top = `${payload.y - bounds.top}px`;
        }
        break;
      }
      case "release":
        ghost.classList.remove("is-visible");
        applyDrop(activeParticle, typeof payload.target === "string" ? payload.target : null, dispatchLearningAction);
        activeParticle = null;
        renderer.endDrag();
        break;
      case "rotate":
        if (typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
          if (
            root.classList.contains("ar-active")
            && (payload.source === "touch" || payload.source === "xr-controller")
          ) {
            renderer.rotateArView(payload.deltaX, payload.deltaY);
          } else {
            renderer.rotate(payload.deltaX, payload.deltaY);
          }
        }
        break;
      case "scale":
        if (typeof payload.delta === "number") {
          if (
            root.classList.contains("ar-active")
            && (payload.source === "touch" || payload.source === "xr-controller")
          ) {
            renderer.scaleArView(payload.delta);
          } else {
            renderer.scale(payload.delta);
          }
        }
        break;
      case "confirm":
        {
          runCommand(typeof payload.command === "string" ? payload.command : "");
        }
        break;
      case "back":
        renderer.resetView();
        break;
      case "hover":
      case "select":
        break;
    }
  };

  const unsubscribe = store.subscribe((state) => {
    renderState(state);
    if (state.chemistry.validationMessages.length > 0 && activeParticle) {
      const particle = activeParticle.replace("tray:", "");
      const source = root.querySelector<HTMLElement>(`[data-particle="${particle}"]`);
      bounceParticle(source);
    }
  });
  input = new ScreenInputAdapter({
    root,
    dispatch: onInput,
    pickTarget: (x, y, source, pointerType) => renderer.pickTarget(x, y, source, pointerType),
    touch: {
      pinchSensitivity: screenZoomConfig.pinchSensitivity,
      pinchDeadZonePx: arTouchGestureConfig.pinchDeadZonePx,
      dragThresholdPx: arTouchGestureConfig.dragThresholdPx,
      shouldIgnoreTarget: (target) =>
        root.classList.contains("ar-active") && isArHudTarget(target),
    },
    onDragEnd: () => {
      activeParticle = null;
      ghost.classList.remove("is-visible");
      renderer.endDrag();
    },
  });

  root.addEventListener("click", onCommandClick);
  const exitButton = requiredElement<HTMLButtonElement>(root, "[data-app-action='exit']");
  const onExitClick = (): void => options.onExit?.();
  if (options.onExit) {
    exitButton.hidden = false;
    exitButton.addEventListener("click", onExitClick);
  }
  renderState(store.getState());
  store.events.emit("module_started", {
    type: "module_started",
    payload: { moduleId: manifest.id },
  });
  store.dispatch({ type: "mission/start", payload: { missionId: manifest.missions[0]?.id ?? "" } });

  return () => {
    disposeZoomControls();
    input?.dispose();
    unsubscribe();
    root.removeEventListener("click", onEventsAction);
    root.removeEventListener("mma:local-telemetry", onLocalTelemetry);
    root.removeEventListener("click", onCommandClick);
    exitButton.removeEventListener("click", onExitClick);
    narrationPlayer.dispose();
    void disposeArControls().finally(() => {
      hud.dispose();
      narrationBar.dispose();
      renderer.dispose();
    });
    root.replaceChildren();
  };
}

function applyDrop(
  source: string | null,
  target: string | null,
  dispatch: (action: EngineAction) => void,
): void {
  if (!source || !target) {
    return;
  }
  const particle = source.replace("tray:", "");
  if (particle !== "proton" && particle !== "neutron" && particle !== "electron") {
    return;
  }
  if (target === "nucleus") {
    dispatch({ type: "particle/place", payload: { particle, target: "nucleus" } });
    return;
  }
  const shellMatch = /^shell:([1-4])$/.exec(target);
  dispatch({
    type: "particle/place",
    payload: {
      particle,
      target: "shell",
      ...(shellMatch ? { shell: Number(shellMatch[1]) } : {}),
    },
  });
}

function applyCommand(
  command: string,
  state: Readonly<AtomBuilderLearningState>,
  dispatch: (action: EngineAction) => void,
  renderer: SceneRenderer,
): void {
  if (command === "reset-view") {
    renderer.resetView();
    return;
  }
  if (command === "atom/reset") {
    dispatch({ type: "atom/reset", payload: null });
    return;
  }
  const lessonAction = lessonCommandToAction(command, () => missionCheckState(state.chemistry));
  if (lessonAction) {
    dispatch(lessonAction);
    return;
  }
  const chemistry = state.chemistry;
  const [, operation, particle] = command.split(":");
  if (operation === "add" && particle === "proton" || operation === "remove" && particle === "proton") {
    dispatch({ type: `particle/${operation}`, payload: { particle: "proton" } });
    return;
  }
  if (operation === "add" && particle === "neutron" || operation === "remove" && particle === "neutron") {
    dispatch({ type: `particle/${operation}`, payload: { particle: "neutron" } });
    return;
  }
  if (particle === "electron" && operation === "remove") {
    dispatch({ type: "electron/remove", payload: { shell: Math.max(1, chemistry.shells.length) } });
    return;
  }
  if (particle === "electron" && operation === "add") {
    const count = chemistry.shells.reduce((sum, shellCount) => sum + shellCount, 0);
    const shell = count >= 20 ? 4 : nextElectronShell(chemistry.shells, count);
    dispatch({ type: "electron/place", payload: { shell } });
  }
}

function renderLearningState(
  root: HTMLElement,
  state: Readonly<AtomBuilderLearningState>,
  items: readonly AssessmentItem[],
  itemsById: ReadonlyMap<string, AssessmentItem>,
  lastHintText: string,
): void {
  const completedCount = Object.values(state.missionProgress).filter(
    (progress) => progress.status === "completed",
  ).length;
  const activeMissionIndex = manifest.missions.findIndex((mission) => mission.id === state.activeMissionId);
  const activeMission = manifest.missions[activeMissionIndex];
  const currentMissionProgress = activeMission
    ? state.missionProgress[activeMission.id]
    : undefined;
  const finished = state.mode === "mission" && state.activeMissionId === null && completedCount === manifest.missions.length;

  requiredElement<HTMLElement>(root, "#lesson-panel").hidden = state.mode === "free-play" || finished;
  requiredElement<HTMLElement>(root, "#free-play-status").hidden = state.mode !== "free-play";
  requiredElement<HTMLElement>(root, "#lesson-summary").hidden = !finished;
  if (finished) {
    const hintsUsed = Object.values(state.missionProgress).reduce((sum, progress) => sum + progress.hintsUsed, 0);
    setText(
      root,
      "#lesson-summary-details",
      `${completedCount} missions done. ${hintsUsed} hints used. ${state.questionsCorrect} questions correct out of ${state.questionsAnswered}.`,
    );
  }

  if (activeMission) {
    setText(root, "#mission-step", `MISSION ${activeMissionIndex + 1} OF ${manifest.missions.length}`);
    setText(root, "#mission-title", activeMission.title);
    setText(root, "#mission-goal", activeMission.goalText);
    setText(root, "#mission-progress", `Progress ${activeMissionIndex + 1}/${manifest.missions.length}`);
    const missionActive = currentMissionProgress?.status === "active";
    requiredElement<HTMLButtonElement>(root, '[data-command="lesson:hint"]').disabled = !missionActive || currentMissionProgress.hintsUsed >= activeMission.hints.length;
    requiredElement<HTMLButtonElement>(root, '[data-command="lesson:check"]').disabled = !missionActive;
    const hintCount = currentMissionProgress?.hintsUsed ?? 0;
    const hintLevel = ["nudge", "clue", "explanation"][Math.max(0, hintCount - 1)] ?? "hint";
    setText(root, "#hint-feedback", hintCount > 0 ? `${hintLevel}: ${lastHintText}` : "");
    setText(
      root,
      "#mission-feedback",
      currentMissionProgress?.status === "completed"
        ? "Goal met. Answer the questions to continue."
        : (currentMissionProgress?.attempts ?? 0) > 0
          ? "Not yet. The atom does not match every part of the goal. Adjust it and check again."
          : "",
    );
  }
  setText(
    root,
    "#ar-panel-mission-title",
    state.mode === "free-play" ? "Free play" : activeMission?.title ?? "Lesson complete",
  );

  const triggeredItems = resolveTriggeredAssessmentItems(state.assessmentIds, items);
  const currentItem = triggeredItems[state.assessmentIndex];
  const assessmentCard = requiredElement<HTMLElement>(root, "#assessment-card");
  assessmentCard.hidden = state.mode === "free-play" || !currentItem;
  if (!currentItem) {
    return;
  }

  setText(root, "#assessment-step", `QUESTION ${state.assessmentIndex + 1} OF ${triggeredItems.length}`);
  setText(root, "#assessment-prompt", currentItem.prompt);
  const optionsRoot = requiredElement<HTMLElement>(root, "#assessment-options");
  optionsRoot.replaceChildren(...currentItem.options.map((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.command = `lesson:assessment:answer:${index}`;
    button.textContent = `${String.fromCharCode(65 + index)}. ${option.text}`;
    button.disabled = state.currentAnswer !== null;
    if (state.currentAnswer?.selectedOptionIndex === index) {
      button.classList.add(state.currentAnswer.correct ? "is-correct" : "is-incorrect");
    }
    if (state.currentAnswer && index === currentItem.correctOptionIndex) {
      button.classList.add("is-answer");
    }
    return button;
  }));
  const feedback = state.currentAnswer
    ? `${state.currentAnswer.correct ? "Correct. " : `Not quite. The correct answer is ${currentItem.options[currentItem.correctOptionIndex]?.text ?? "shown above"}. `}${currentItem.explanation}`
    : "";
  setText(root, "#assessment-feedback", feedback);
  const nextButton = requiredElement<HTMLButtonElement>(root, "#assessment-continue");
  nextButton.hidden = state.currentAnswer === null;
  nextButton.textContent = state.assessmentIndex + 1 < triggeredItems.length ? "Next question" : "Continue";
  if (itemsById.size !== items.length) {
    throw new Error("Assessment item IDs must be unique.");
  }
}

function nextElectronShell(shells: readonly number[], count: number): number {
  if (count >= 20) {
    return 4;
  }
  const nextConfiguration = bohrBuryConfiguration(count + 1);
  const changedShell = nextConfiguration.findIndex((value, index) => value !== (shells[index] ?? 0));
  return changedShell < 0 ? 4 : changedShell + 1;
}

function formatCharge(charge: number): string {
  return charge > 0 ? `+${charge}` : String(charge);
}

function asPayload(payload: EngineAction["payload"]): Record<string, string | number | null> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, string | number | null>
    : {};
}

function setText(root: HTMLElement, selector: string, text: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = text;
  }
}

function requiredElement<ElementType extends HTMLElement>(root: HTMLElement, selector: string): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Required Atom Builder element not found: ${selector}`);
  }
  return element;
}

function bounceParticle(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  element.classList.remove("is-rejected");
  void element.offsetWidth;
  element.classList.add("is-rejected");
}

function isArHudTarget(target: EventTarget | null): boolean {
  // Gestures on HUD controls stay with the controls (taps, sheet scrolling);
  // gestures on the open camera view turn and resize the atom.
  return target instanceof Element && target.closest(
    ".ar-hud-top, .ar-hud-sheet, .ar-hud-tabs, .ar-hud-caption-slot, " +
    ".ar-status, .ar-break-reminder, .ar-diagnostics, .ar-confirmation",
  ) !== null;
}
export { buildXrLessonContent, type XrLessonExtras } from "./xr-lesson.js";
