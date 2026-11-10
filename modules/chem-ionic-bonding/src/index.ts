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
  MoleculeView,
  SceneRenderer,
  ScreenInputAdapter,
  XR_COMMAND,
  arTouchGestureConfig,
  atomIdFromTarget,
  installZoomControls,
  screenZoomConfig,
  type InputAction,
  type ScreenZoomDistances,
  type WorldOptions,
} from "@mma/engine-render";
import {
  createLessonPanel,
  createNarrationBar,
  createXrHud,
  el,
  mountXrSession,
  narrationButtonLabels,
} from "@mma/engine-ui";
import "@mma/engine-ui/lesson-ui.css";
import "@mma/engine-ui/xr-hud.css";
import { telemetryEventSchema } from "@mma/schema";
import {
  NarrationPlayer,
  createNarrationAssetLoader,
  publishNarrationTelemetry,
  type NarrationViewState,
} from "@mma/engine-voice";
import {
  IONIC_BONDING_ACTION,
  ionicBondingCheckState,
  ionicCompoundById,
  layoutIonicBonding,
  type IonicBondingLayout,
} from "@mma/kit-chemistry";
import giveElectronItems from "../assessments/m1-give-electron.json";
import joinIonsItems from "../assessments/m2-join-ions.json";
import { createIonicLessonReducer, createIonicLessonState, projectIonicLessonEvents } from "./learning.js";
import { manifest } from "./manifest.js";
import {
  buildBenchView,
  buildXrPanelsContent,
  ionText,
  outerElectronHandles,
  parseMoveCommand,
  toSceneFrame,
  type BenchAtomView,
  type BenchMove,
  type ElectronHandle,
} from "./view-model.js";
import "./ionic-bonding.css";

export { manifest, toSceneFrame };

/** Version 1 shows sodium chloride; other rows of the compound table work the same way. */
const COMPOUND_ID = "nacl";
/** The row of atoms is wider than one atom, so the camera starts further back. */
const IONIC_ZOOM: ScreenZoomDistances = { minDistance: 12, maxDistance: 40, defaultDistance: 24 };
/** In AR/VR the row of atoms (about 12 units) is drawn about 30 cm wide. */
const XR_CONTENT_SCALE = 0.025;
/** Lift the model and panels so the model sits just above eye level in AR and VR. */
const XR_LIFT = 0.15;
const SOUND_ICON = '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>';
/** Narration commands from the headset panel dock. */
const NARRATION_COMMAND = { sound: "narration:sound", captions: "narration:captions", replay: "narration:replay" } as const;
/** Generated narration (MP3 from the shared Piper generator) and captions, bundled by Vite. */
const narrationAudioUrls = import.meta.glob<string>("../narration/en/generated/*.mp3", { eager: true, import: "default" });
const narrationCaptionFiles = import.meta.glob<string>("../narration/en/generated/*.vtt", { eager: true, query: "?raw", import: "default" });
const MISSION_ICON = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>';
const ATOMS_ICON = '<circle cx="8" cy="12" r="4"/><circle cx="16.5" cy="12" r="5"/><path d="M12 12h0.5"/>';
/** `data-particle` prefix of the grab rings; the input adapter reports it as `tray:give:<atom>:<index>`. */
const GIVE_PREFIX = "give:";
const GIVE_SOURCE = `tray:${GIVE_PREFIX}`;

const LESSON_COPY: LessonViewCopy = {
  idleEyebrow: "IONIC BONDING",
  freePlayTitle: "Explore freely",
  freePlayBody: "Move electrons, join the ions, or start over.",
  notYetFeedback: "Not yet. The model does not match every part of the goal. Read the goal again and check once more.",
};

const rawAssessmentItems = [...giveElectronItems, ...joinIonsItems];
const assessmentItems: readonly AssessmentItem[] = rawAssessmentItems.map((item) => assessmentItemSchema.parse(item));

/** Mount-time options for the Ionic Bonding web view. */
export interface IonicBondingOptions {
  /** IWSDK project options (`virtual:iwsdk-project`); renderer defaults are used when omitted. */
  readonly worldOptions?: WorldOptions;
  /** Called when the student presses "Experiments"; the button is hidden when omitted. */
  readonly onExit?: () => void;
}

/** Mount the Ionic Bonding experiment in screen (web) view and return its full teardown. */
export function mountIonicBonding(root: HTMLElement, options: IonicBondingOptions = {}): () => void {
  const compound = ionicCompoundById(COMPOUND_ID);
  if (!compound) throw new Error(`Compound "${COMPOUND_ID}" is missing from the compound table.`);

  const page = el(document, "div", "ionic mma-ui");
  page.innerHTML = `
    <header class="ionic-header">
      <button class="mma-button mma-button--quiet ionic-back" type="button" data-app-action="exit" hidden>
        <span aria-hidden="true">&larr;</span> Experiments
      </button>
      <div class="ionic-title">
        <p class="mma-eyebrow">Chemistry &middot; Class 9-10</p>
        <h1>Ionic Bonding</h1>
      </div>
      <button class="mma-button mma-button--secondary" type="button" data-command="ionic:reset">Start over</button>
    </header>
    <main class="ionic-layout">
      <div class="ionic-lesson" data-slot="lesson"></div>
      <section class="ionic-stage mma-card" aria-labelledby="ionic-stage-title">
        <div class="ionic-stage__bar">
          <h2 class="mma-eyebrow" id="ionic-stage-title">Live model</h2>
          <div class="ionic-stage__actions" data-slot="xr-entry">
            <button class="mma-button mma-button--quiet" type="button" data-command="view:reset">Reset view</button>
          </div>
        </div>
        <p class="ionic-bench__instruction" data-slot="instruction"></p>
        <div class="ionic-scene" data-slot="scene" aria-hidden="true">
          <div class="ionic-labels" data-slot="labels"></div>
          <div class="ionic-handles" data-slot="handles"></div>
        </div>
        <p class="ionic-tip">Drag an empty part of the model to turn it. Scroll or pinch to zoom.</p>
        <p class="ionic-status" data-slot="status" role="status" aria-live="polite"></p>
        <div class="ionic-caption" data-slot="caption"></div>
        <div class="ionic-moves" data-slot="moves" aria-label="Move electrons with the keyboard"></div>
      </section>
      <section class="ionic-bench mma-card" data-slot="bench" aria-labelledby="ionic-bench-title">
        <h2 class="ionic-bench__title" id="ionic-bench-title">Atoms and ions</h2>
        <ul class="ionic-atoms" data-slot="atoms"></ul>
        <div class="ionic-bench__actions">
          <button class="mma-button mma-button--primary" type="button" data-command="ionic:join">Join the ions</button>
        </div>
      </section>
    </main>
    <div class="ionic-drag-ghost" data-slot="ghost" aria-hidden="true">e&#8315;</div>
  `;
  root.replaceChildren(page);

  const slot = <Element extends HTMLElement>(name: string): Element => {
    const found = page.querySelector<Element>(`[data-slot="${name}"]`);
    if (!found) throw new Error(`Ionic Bonding element missing: ${name}`);
    return found;
  };
  const sceneHost = slot<HTMLElement>("scene");
  const labelsLayer = slot<HTMLElement>("labels");
  const handlesLayer = slot<HTMLElement>("handles");
  const statusLine = slot<HTMLElement>("status");
  const instruction = slot<HTMLElement>("instruction");
  const atomList = slot<HTMLUListElement>("atoms");
  const movesArea = slot<HTMLElement>("moves");
  const ghost = slot<HTMLElement>("ghost");
  const joinButton = page.querySelector<HTMLButtonElement>('[data-command="ionic:join"]')!;
  const lessonPanel = createLessonPanel();
  slot<HTMLElement>("lesson").append(lessonPanel.element);

  const molecule = new MoleculeView();
  const renderer = new SceneRenderer({
    host: sceneHost,
    content: molecule,
    screenZoom: IONIC_ZOOM,
    xrContentScale: XR_CONTENT_SCALE,
    handheldOverlay: true,
    xrLift: XR_LIFT,
    ...(options.worldOptions === undefined ? {} : { worldOptions: options.worldOptions }),
  });
  renderer.ready
    // Fit the widest arrangement (atoms apart, before joining) so every atom stays in view.
    .then(() => renderer.fitToWidth(layoutIonicBonding(createIonicLessonState(manifest.missions, compound).bonding).width))
    .catch((error: unknown) => {
      console.error("The 3D scene could not start; the lesson controls keep working.", error);
    });
  const disposeZoom = installZoomControls(
    sceneHost,
    () => renderer.getDistance(),
    (distance) => renderer.setDistance(distance),
    { ...screenZoomConfig, ...IONIC_ZOOM },
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
    createIonicLessonReducer(manifest.missions, rawAssessmentItems),
    createIonicLessonState(manifest.missions, compound),
    {
      telemetry: {
        context: telemetryContext,
        clock: () => new Date().toISOString(),
        idGenerator,
        projectEvents: (action, previous, next) => projectIonicLessonEvents(manifest.missions, action, previous, next),
      },
    },
  );

  // UI-only state (never learning state): the electron the student picked or is carrying.
  let selectedGiver: string | null = null;
  let lastHintText = "";
  let layout: IonicBondingLayout = layoutIonicBonding(store.getState().bonding);
  let handles: readonly ElectronHandle[] = [];
  let carried: { readonly key: string; readonly atomId: string; moved: boolean } | null = null;
  let stageGesture: { rotated: boolean } | null = null;
  let frame = 0;
  // Immersive session state: phone AR uses the page HUD; headsets and the emulator use panels.
  let xrActive = false;
  let xrPanels = false;
  let xrExitLabel = "Exit AR";
  let shownQuestion = "";
  let narrationView: NarrationViewState | null = null;
  const labels = new Map<string, HTMLElement>();
  const handleElements = new Map<string, HTMLElement>();

  const dispatch = (action: EngineAction): void => {
    store.dispatch(action);
  };

  const takerIds = (): string[] => layout.atoms.filter((atom) => atom.canTake).map((atom) => atom.id);

  const transfer = (from: string, to: string): void => {
    selectedGiver = null;
    dispatch({ type: IONIC_BONDING_ACTION.transfer, payload: { from, to } });
    if (store.getState().bonding.validationMessages[0]) {
      store.events.emit("invalid_placement", {
        type: "invalid_placement",
        payload: { missionId: store.getState().activeMissionId, particle: "electron", target: `atom:${to}` },
      });
    }
    render();
  };

  /** A tap on an atom in the model: pick the giver's electron, or give it to a taker. */
  const tapAtom = (atomId: string): void => {
    const atom = layout.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) return;
    if (atom.canGive) {
      selectedGiver = selectedGiver === atomId ? null : atomId;
      dispatch({ type: IONIC_BONDING_ACTION.clearValidation, payload: null });
      render();
      return;
    }
    if (selectedGiver) {
      transfer(selectedGiver, atomId);
      return;
    }
    // Let the rules explain why this atom cannot give (chlorine, or Na+ with no outer electron).
    const other = layout.atoms.find((candidate) => candidate.canGive && candidate.id !== atomId)
      ?? layout.atoms.find((candidate) => candidate.id !== atomId);
    transfer(atomId, other?.id ?? atomId);
  };

  const runCommand = (command: string): void => {
    const state = store.getState();
    const move = parseMoveCommand(command);
    if (move) {
      transfer(move.from, move.to);
      return;
    }
    if (command === XR_COMMAND.exit) {
      void xrSession.exit();
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
    if (command === "view:reset") {
      renderer.resetView();
      return;
    }
    if (command === "ionic:join" || command === "ionic:reset") {
      selectedGiver = null;
      dispatch({ type: command === "ionic:join" ? IONIC_BONDING_ACTION.bond : IONIC_BONDING_ACTION.reset, payload: null });
      render();
      return;
    }
    if (command === "lesson:hint") {
      const mission = manifest.missions.find((item) => item.id === state.activeMissionId);
      const used = state.activeMissionId ? state.missionProgress[state.activeMissionId]?.hintsUsed ?? 0 : 0;
      lastHintText = mission?.hints[used] ?? "";
    }
    const previousMission = state.activeMissionId;
    const action = lessonCommandToAction(command, () => ionicBondingCheckState(store.getState().bonding));
    if (action) dispatch(action);
    if (store.getState().activeMissionId !== previousMission) lastHintText = "";
    render();
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const command = target?.closest<HTMLElement>("[data-command]")?.dataset.command;
    if (command) {
      runCommand(command);
      return;
    }
    const move = target?.closest<HTMLElement>("[data-move-from]");
    if (move?.dataset.moveFrom && move.dataset.moveTo) {
      transfer(move.dataset.moveFrom, move.dataset.moveTo);
      movesArea.querySelector<HTMLElement>("button")?.focus();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    const onStage = event.target instanceof Element && sceneHost.contains(event.target)
      && event.target.closest("[data-particle]") === null;
    stageGesture = onStage ? { rotated: false } : null;
  };

  /** Show the carried electron at the pointer, and where it can land. */
  const carry = (key: string, atomId: string): void => {
    carried = { key, atomId, moved: false };
    molecule.update(toSceneFrame(layout, key));
    molecule.setSlotsVisibleFor(takerIds());
    placeOverlays();
  };

  const drop = (): void => {
    carried = null;
    ghost.classList.remove("is-visible");
    molecule.setSlotsVisible(false);
    renderer.setHighlight(null);
  };

  const onInput = (action: InputAction): void => {
    const payload = (typeof action.payload === "object" && action.payload !== null && !Array.isArray(action.payload)
      ? action.payload
      : {}) as Record<string, unknown>;
    const source = typeof payload.source === "string" ? payload.source : "";
    const target = typeof payload.target === "string" ? payload.target : null;
    switch (action.type) {
      case "grab":
        if (source.startsWith(GIVE_SOURCE)) {
          const key = source.slice(GIVE_SOURCE.length);
          carry(key, key.split(":")[0] ?? "");
        }
        break;
      case "move":
        if (carried) {
          carried.moved = true;
          const atomId = atomIdFromTarget(target);
          renderer.setHighlight(atomId && takerIds().includes(atomId) ? target : null);
          if (typeof payload.x === "number" && typeof payload.y === "number") {
            const bounds = page.getBoundingClientRect();
            ghost.style.transform = `translate(${payload.x - bounds.left}px, ${payload.y - bounds.top}px)`;
            ghost.classList.add("is-visible");
          }
        }
        break;
      case "release":
        if (carried) {
          const { atomId: from, moved } = carried;
          drop();
          const to = atomIdFromTarget(target);
          if (to && to !== from && payload.cancelled !== true) transfer(from, to);
          else if (!moved) tapAtom(from);
          else render();
        } else if (stageGesture && !stageGesture.rotated && payload.cancelled !== true) {
          const atomId = atomIdFromTarget(target);
          if (atomId) tapAtom(atomId);
        }
        stageGesture = null;
        break;
      case "rotate":
        if (stageGesture && typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
          stageGesture.rotated = true;
          if (xrActive) renderer.rotateArView(payload.deltaX, payload.deltaY);
          else renderer.rotate(payload.deltaX, payload.deltaY);
        }
        break;
      case "scale":
        if (typeof payload.delta === "number") {
          if (xrActive) renderer.scaleArView(payload.delta);
          else renderer.scale(payload.delta);
        }
        break;
      case "back":
        renderer.resetView();
        break;
      default:
        break;
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
      // Scrolling and tapping the panels must not turn the model.
      shouldIgnoreTarget: (target) => target instanceof Element && !sceneHost.contains(target),
    },
    onDragEnd: () => ghost.classList.remove("is-visible"),
  });

  // --- Narration (shared player, loader and bar) ---------------------------------
  const narrationBar = createNarrationBar({
    enableSound: () => void narrationPlayer.enableSound(),
    toggleMuted: () => narrationPlayer.toggleMuted(),
    replay: () => narrationPlayer.replayLastCue(),
    toggleCaptions: () => narrationPlayer.toggleCaptions(),
    setSpeed: (speed) => narrationPlayer.setSpeed(speed),
  });
  slot<HTMLElement>("lesson").append(narrationBar.controls);
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

  // --- AR and VR --------------------------------------------------------------
  const hud = createXrHud({
    host: page,
    tabs: [
      { id: "mission", label: "Mission", icon: MISSION_ICON, sections: [lessonPanel.element] },
      { id: "atoms", label: "Atoms", icon: ATOMS_ICON, sections: [slot<HTMLElement>("bench")] },
      { id: "sound", label: "Sound", icon: SOUND_ICON, sections: [narrationBar.controls] },
    ],
    live: [narrationBar.caption, instruction, statusLine],
    tip: "Drag the glowing electron onto chlorine. Pinch to resize.",
    onResetView: () => renderer.resetArView(),
  });
  const xrSession = mountXrSession({
    root: page,
    entrySlot: slot<HTMLElement>("xr-entry"),
    exitSlot: hud.exitSlot,
    subject: "the model",
    renderer,
    telemetryContext,
    clock: () => new Date().toISOString(),
    idGenerator,
    onComfortBreak: () => {
      const event = telemetryEventSchema.parse({
        ...telemetryContext,
        eventId: idGenerator(),
        ts: new Date().toISOString(),
        type: "comfort_break_shown",
        payload: { missionId: store.getState().activeMissionId },
        device: { ...telemetryContext.device, mode: xrExitLabel === "Exit VR" ? "vr" : "ar" },
      });
      store.events.emit("comfort_break_shown", event as LearningEventMap["comfort_break_shown"]);
    },
    onActiveChange: (active, info) => {
      xrActive = active;
      xrPanels = active && !info.overlay;
      page.classList.toggle("ionic--xr-panels", xrPanels);
      xrExitLabel = info.mode === "immersive-vr" ? "Exit VR" : "Exit AR";
      // Phone AR keeps touch on the page overlay; headsets and the emulator use IWSDK input.
      input.setEnabled(!active || info.overlay);
      if (carried) drop();
      if (active && info.overlay) hud.mount();
      else hud.unmount();
      if (!xrPanels) renderer.hideLessonPanels();
      render();
    },
  });

  function render(): void {
    const state = store.getState();
    layout = layoutIonicBonding(state.bonding);
    if (selectedGiver && !layout.atoms.some((atom) => atom.id === selectedGiver && atom.canGive)) selectedGiver = null;
    handles = outerElectronHandles(layout);
    molecule.update(toSceneFrame(layout));
    renderer.contentChanged();
    renderer.setHighlight(null);
    molecule.setSlotsVisibleFor(selectedGiver ? takerIds() : []);

    lessonPanel.update(buildLessonView(state, manifest.missions, assessmentItems, lastHintText, LESSON_COPY));
    const bench = buildBenchView(state.bonding, selectedGiver, compound!.name);
    instruction.textContent = bench.instruction;
    statusLine.textContent = bench.status.text;
    statusLine.dataset.tone = bench.status.tone;
    statusLine.hidden = bench.status.text === "";
    joinButton.disabled = !bench.canJoin;
    renderAtomCards(bench.atoms);
    renderMoves(bench.moves);
    renderLabels();
    renderHandles(state.bonding.electronsTransferred === 0);
    // Headsets and the emulator do not draw the page, so the labels go into the scene.
    molecule.setLabels(xrPanels
      ? layout.atoms.map((atom) => ({
        id: atom.id,
        symbol: atom.symbol,
        charge: ionText(atom.symbol, atom.charge).charge,
        tone: atom.charge > 0 ? "positive" as const : atom.charge < 0 ? "negative" as const : "neutral" as const,
        position: atom.labelAnchor,
      }))
      : []);

    const lessonView = buildLessonView(state, manifest.missions, assessmentItems, lastHintText, LESSON_COPY);
    hud.setStatus(state.mode === "free-play" ? "Free play" : [lessonView.eyebrow, lessonView.title].filter(Boolean).join(" \u00b7 "));
    // A new question needs an answer before the lesson goes on, so open the Mission sheet once.
    const questionKey = lessonView.assessment ? `${lessonView.assessment.step}:${lessonView.assessment.prompt}` : "";
    if (questionKey && questionKey !== shownQuestion) hud.open("mission");
    shownQuestion = questionKey;
    if (xrPanels) refreshPanels(lessonView, bench);
  }

  /** Update the headset / emulator panels, including narration controls and caption. */
  function refreshPanels(
    lessonView = buildLessonView(store.getState(), manifest.missions, assessmentItems, lastHintText, LESSON_COPY),
    bench = buildBenchView(store.getState().bonding, selectedGiver, compound!.name),
  ): void {
    const labels = narrationButtonLabels(narrationView ?? {
      audioEnabled: false,
      settings: { muted: false, speed: 1, captionsEnabled: true, soundEnabled: false },
    });
    renderer.setModulePanels({
      ...buildXrPanelsContent(lessonView, bench, xrExitLabel),
      narration: {
        caption: narrationView?.settings.captionsEnabled ? narrationView.captionText : "",
        sound: { label: labels.sound, command: NARRATION_COMMAND.sound },
        captions: { label: labels.captions, command: NARRATION_COMMAND.captions },
        replay: { label: labels.replay, command: NARRATION_COMMAND.replay },
      },
    }, runCommand);
  }

  function renderAtomCards(atoms: readonly BenchAtomView[]): void {
    atomList.replaceChildren(...atoms.map((atom) => {
      const item = el(document, "li", "ionic-atom");
      const card = el(document, "div", "ionic-atom__card");
      card.classList.toggle("is-selected", atom.selected);
      card.classList.toggle("is-target", selectedGiver !== null && atom.canTake);
      card.innerHTML = `
        <span class="ionic-atom__symbol" aria-hidden="true"></span>
        <dl class="ionic-atom__facts">
          <dt class="mma-visually-hidden">Atom</dt><dd class="ionic-atom__name"></dd>
          <dt class="mma-visually-hidden">Role</dt><dd class="ionic-atom__role"></dd>
          <div class="ionic-atom__row"><dt>Shells</dt><dd class="ionic-atom__config"></dd></div>
          <div class="ionic-atom__row"><dt>Outer shell</dt><dd class="ionic-atom__outer"></dd></div>
          <div class="ionic-atom__row"><dt>Charge</dt><dd class="ionic-atom__charge"></dd></div>
        </dl>`;
      const symbol = card.querySelector<HTMLElement>(".ionic-atom__symbol")!;
      symbol.textContent = atom.ion.symbol;
      if (atom.ion.charge) symbol.append(el(document, "sup", "", atom.ion.charge));
      card.querySelector<HTMLElement>(".ionic-atom__name")!.textContent = atom.ion.charge ? `${atom.name} ion (${atom.ion.spoken})` : atom.name;
      card.querySelector<HTMLElement>(".ionic-atom__role")!.textContent = atom.role;
      card.querySelector<HTMLElement>(".ionic-atom__config")!.textContent = atom.configuration;
      const outer = card.querySelector<HTMLElement>(".ionic-atom__outer")!;
      outer.textContent = atom.outerShell;
      outer.classList.toggle("is-complete", atom.outerShellComplete);
      card.querySelector<HTMLElement>(".ionic-atom__charge")!.textContent = atom.charge;
      item.append(card);
      return item;
    }));
  }

  /** Keyboard and screen-reader path: one button per allowed move, shown when focused. */
  function renderMoves(moves: readonly BenchMove[]): void {
    const hadFocus = movesArea.contains(document.activeElement);
    movesArea.replaceChildren(...moves.map((move) => {
      const button = el(document, "button", "mma-button mma-button--secondary ionic-move", move.label);
      button.type = "button";
      button.dataset.moveFrom = move.from;
      button.dataset.moveTo = move.to;
      return button;
    }));
    if (hadFocus) (movesArea.querySelector<HTMLElement>("button") ?? joinButton).focus();
  }

  function renderLabels(): void {
    syncElements(labels, labelsLayer, layout.atoms.map((atom) => atom.id), () => el(document, "span", "ionic-label"));
    for (const atom of layout.atoms) {
      const label = labels.get(atom.id)!;
      const ion = ionText(atom.symbol, atom.charge);
      label.replaceChildren(ion.symbol);
      if (ion.charge) label.append(el(document, "sup", "", ion.charge));
      label.dataset.tone = atom.charge > 0 ? "positive" : atom.charge < 0 ? "negative" : "neutral";
    }
  }

  /** Grab rings over each outer electron that can be given; the first shows a hint until the first move. */
  function renderHandles(showHint: boolean): void {
    syncElements(handleElements, handlesLayer, handles.map((handle) => handle.key), (key) => {
      const handle = el(document, "span", "ionic-electron");
      handle.dataset.particle = `${GIVE_PREFIX}${key}`;
      handle.title = "Drag this electron";
      return handle;
    });
    handles.forEach((handle, index) => {
      const element = handleElements.get(handle.key)!;
      element.classList.toggle("is-selected", handle.atomId === selectedGiver);
      element.replaceChildren();
      if (showHint && index === 0 && !selectedGiver) {
        element.append(el(document, "span", "ionic-electron__hint", "Drag me"));
      }
    });
  }

  function syncElements(
    map: Map<string, HTMLElement>,
    parent: HTMLElement,
    keys: readonly string[],
    create: (key: string) => HTMLElement,
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

  /** Keep labels and grab rings on their atoms as the model turns and zooms. */
  function placeOverlays(): void {
    const place = (element: HTMLElement | undefined, point: Parameters<typeof renderer.projectContentPoint>[0], anchor: string): void => {
      if (!element) return;
      const projected = renderer.projectContentPoint(point);
      element.hidden = !projected?.visible;
      if (projected) element.style.transform = `translate(${projected.x}px, ${projected.y}px) ${anchor}`;
    };
    for (const atom of layout.atoms) place(labels.get(atom.id), atom.labelAnchor, "translate(-50%, -100%)");
    for (const handle of handles) {
      const element = handleElements.get(handle.key);
      place(element, handle.position, "translate(-50%, -50%)");
      if (element && carried?.key === handle.key) element.hidden = true;
    }
  }

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
  page.addEventListener("click", onClick);
  page.addEventListener("pointerdown", onPointerDown, { capture: true });

  store.events.emit("module_started", { type: "module_started", payload: { moduleId: manifest.id } });
  dispatch({ type: "mission/start", payload: { missionId: manifest.missions[0]?.id ?? "" } });
  render();
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    input.dispose();
    disposeZoom();
    page.removeEventListener("click", onClick);
    page.removeEventListener("pointerdown", onPointerDown, { capture: true });
    exitButton.removeEventListener("click", onExit);
    hud.dispose();
    narrationPlayer.dispose();
    narrationBar.dispose();
    void xrSession.dispose().finally(() => renderer.dispose());
    root.replaceChildren();
  };
}
