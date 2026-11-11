import { createIdGenerator, createStore, type EngineAction, type TelemetryContext } from "@mma/engine-core";
import { assessmentItemSchema, type AssessmentItem } from "@mma/engine-assess";
import {
  buildJourneyView,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyBeatEndedAction,
  journeyCommandToAction,
  journeyTapAction,
  projectJourneyFlowEvents,
  type JourneyFlowState,
  type JourneyView,
} from "@mma/engine-lesson";
import {
  CellView,
  SceneRenderer,
  ScreenInputAdapter,
  arTouchGestureConfig,
  installZoomControls,
  parseCellTarget,
  screenZoomConfig,
  type InputAction,
  type ScreenZoomDistances,
  type WorldOptions,
} from "@mma/engine-render";
import {
  JourneyBeatRunner,
  NarrationPlayer,
  createNarrationAssetLoader,
  publishNarrationTelemetry,
  type NarrationViewState,
} from "@mma/engine-voice";
import { layoutCell, organelleById, organellePart, type CellLayout, type OrganelleId, type OrganellePartId } from "@mma/kit-biology";
import chloroplastItems from "../assessments/chloroplasts.json";
import mitochondriaItems from "../assessments/mitochondria.json";
import recapItems from "../assessments/recap.json";
import { manifest } from "./manifest.js";
import {
  INTRO_SHOT,
  buildSceneFrame,
  cameraShot,
  detailForShot,
  organelleSpot,
  stageLabels,
  stagePlan,
  type StageLabel,
  type StagePlan,
} from "./scene.js";
import "./cell-explorer.css";

export { manifest };

/** Generated narration (MP3 from the shared Piper generator), bundled by Vite. Missing clips fall back to captions. */
const narrationAudioUrls = import.meta.glob<string>("../narration/en/generated/*.mp3", { eager: true, import: "default" });
const narrationCaptionFiles = import.meta.glob<string>("../narration/en/generated/*.vtt", { eager: true, query: "?raw", import: "default" });

const rawAssessmentItems: readonly unknown[] = [...mitochondriaItems, ...chloroplastItems, ...recapItems];
const assessmentItems: readonly AssessmentItem[] = rawAssessmentItems.map((item) => assessmentItemSchema.parse(item));
const journey = manifest.journey!;
const ZOOM: ScreenZoomDistances = { minDistance: 0.4, maxDistance: 80, defaultDistance: 14 };
/** The fly-in from empty space when the journey starts. */
const ARRIVAL_MS = 3400;
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6zm0 4a4 4 0 1 0 4 4h-2a2 2 0 1 1-2-2z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>',
  captions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 5v4a1 1 0 0 0 1 1h3v-1.5H7.5v-3H10V9H7a1 1 0 0 0-1 1zm7 0v4a1 1 0 0 0 1 1h3v-1.5h-2.5v-3H17V9h-3a1 1 0 0 0-1 1z"/></svg>',
} as const;

/** Options for {@link mountCellExplorer}. */
export interface CellExplorerOptions {
  /** IWSDK world options, normally the project's (`virtual:iwsdk-project`). */
  readonly worldOptions?: WorldOptions;
  /** Back to the dashboard; shows the "Universe" button when set. */
  readonly onExit?: () => void;
}

/**
 * Mount the Plant vs Animal Cell explorer: a narrated journey past a plant cell and an
 * animal cell, chapter by chapter, with checkpoints answered on the live model and scored
 * questions after each chapter. The page is a light, open stage; every label is pinned to
 * the model. Returns the teardown.
 */
export function mountCellExplorer(root: HTMLElement, options: CellExplorerOptions = {}): () => void {
  root.innerHTML = `
    <section class="cell-explorer" aria-label="Plant vs Animal Cell" data-status="intro">
      <div class="cx-motes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="cx-stage"></div>
      <div class="cx-labels" aria-hidden="true"></div>
      <header class="cx-top">
        <button class="cx-pill cx-back" type="button" data-app-action="exit" aria-label="Back to all experiments" hidden>&larr; Universe</button>
        <ol class="cx-path" aria-label="Chapters"></ol>
      </header>
      <div class="cx-intro">
        <p class="cx-eyebrow">BIOLOGY</p>
        <h1>Plant vs Animal Cell</h1>
        <p class="cx-lede">Fly in close to two living cells and find out what makes them different.</p>
        <button class="cx-pill cx-pill--primary cx-start" type="button" data-command="journey:play">Start the journey</button>
      </div>
      <div class="cx-ask" aria-live="polite" hidden>
        <p class="cx-eyebrow cx-ask-step"></p>
        <p class="cx-ask-prompt"></p>
        <p class="cx-ask-note"></p>
        <div class="cx-answers"></div>
        <p class="cx-ask-feedback"></p>
        <p class="cx-ask-hint"></p>
        <div class="cx-ask-actions"></div>
      </div>
      <p class="cx-caption" aria-live="polite"><small class="cx-eyebrow"></small><span></span></p>
      <p class="cx-name" role="status" aria-live="polite"></p>
      <div class="cx-dock" role="toolbar" aria-label="Journey controls"></div>
    </section>`;
  const page = root.querySelector<HTMLElement>(".cell-explorer")!;
  const part = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const stage = part<HTMLElement>(".cx-stage");
  const labelLayer = part<HTMLElement>(".cx-labels");

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const lightweight = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const cellView = new CellView({ quality: lightweight ? "low" : "high" });
  const renderer = new SceneRenderer({
    host: stage,
    content: cellView,
    screenZoom: ZOOM,
    reducedMotion,
    ...(options.worldOptions === undefined ? {} : { worldOptions: options.worldOptions }),
  });
  const fov = options.worldOptions?.render?.fov ?? 40;
  const disposeZoom = installZoomControls(stage, () => renderer.getDistance(), (distance) => renderer.setDistance(distance), { ...screenZoomConfig, ...ZOOM });

  const idGenerator = createIdGenerator({ crypto: globalThis.crypto, now: Date.now });
  const telemetryContext = {
    studentRef: idGenerator(),
    sessionId: idGenerator(),
    moduleId: manifest.id,
    moduleVersion: "0.0.0",
    device: { mode: "screen", tier: lightweight ? "low" : "mid" },
  } satisfies TelemetryContext;
  const store = createStore(
    createJourneyFlowReducer(journey, manifest.missions, rawAssessmentItems),
    createJourneyFlowState(manifest.missions),
    {
      telemetry: {
        context: telemetryContext,
        clock: () => new Date().toISOString(),
        idGenerator,
        projectEvents: (action, previous, next) => projectJourneyFlowEvents(manifest.missions, action, previous, next),
      },
    },
  );
  const dispatch = (action: EngineAction): void => store.dispatch(action);

  /** True once the 3D world exists and the stage can be drawn. */
  let ready = false;

  // Narration: each beat speaks its cue; without sound the caption shows for the beat's time.
  let narrationView: NarrationViewState | null = null;
  const narration = new NarrationPlayer({
    cues: manifest.narration?.cues ?? [],
    events: store.events,
    moduleId: manifest.id,
    activityTarget: page,
    ...createNarrationAssetLoader({ audioUrls: narrationAudioUrls, captions: narrationCaptionFiles }),
    onViewChange: (view) => {
      narrationView = view;
      if (ready) renderCaption(buildJourneyView(store.getState() as JourneyFlowState, journey, manifest.missions, assessmentItems));
      renderSound();
    },
    onTelemetry: (draft) =>
      publishNarrationTelemetry(draft, store.events, telemetryContext, () => new Date().toISOString(), idGenerator),
    onCueEnded: (cueId, outcome) => runner.cueEnded(cueId, outcome),
  });
  const runner = new JourneyBeatRunner({ narrator: narration, onBeatEnded: (beatId) => dispatch(journeyBeatEndedAction(beatId)) });

  // --- stage ---------------------------------------------------------------------------
  let plan: StagePlan = stagePlan(1.6);
  let cells: readonly CellLayout[] = [];
  let sceneKey = "";
  let shotKey = "";
  let labels: readonly StageLabel[] = [];
  let labelElements = new Map<string, HTMLElement>();
  let nameTimer: ReturnType<typeof setTimeout> | undefined;

  const aspect = (): number => Math.max(0.3, stage.clientWidth / Math.max(1, stage.clientHeight));

  /** Place the cells for the viewport shape, and the shot's opened close-up, when either changes. */
  function syncScene(view: JourneyView): void {
    const nextPlan = stagePlan(aspect());
    const detail = view.status === "intro" || view.status === "finished" ? null : detailForShot(view.shot);
    const key = `${nextPlan.arrangement}|${detail ?? ""}`;
    if (key === sceneKey) return;
    const arrangementChanged = nextPlan.arrangement !== plan.arrangement || cells.length === 0;
    plan = nextPlan;
    sceneKey = key;
    if (arrangementChanged) {
      const density = lightweight ? "light" : "full";
      cells = [layoutCell("plant", { position: plan.plant, density }), layoutCell("animal", { position: plan.animal, density })];
      shotKey = "";
    }
    const spot = detail ? organelleSpot(detail, cells) : null;
    cellView.update(buildSceneFrame(cells, spot ? [spot] : []));
    renderer.contentChanged();
  }

  /** Fly to the view's shot when it (or the stage shape) changes. */
  function syncShot(view: JourneyView, force = false): void {
    const shot = view.status === "intro" ? INTRO_SHOT : view.shot ?? "wide";
    const key = `${shot}|${plan.arrangement}|${aspect().toFixed(2)}`;
    if (!force && key === shotKey) return;
    const arriving = shotKey.startsWith(`${INTRO_SHOT}|`) && shot !== INTRO_SHOT;
    const instant = shotKey === "" || force;
    shotKey = key;
    renderer.focusOn(cameraShot(shot, plan, aspect(), fov, cells), instant ? { durationMs: 0 } : arriving ? { durationMs: ARRIVAL_MS } : {});
  }

  function syncLabels(view: JourneyView): void {
    labels = stageLabels({ status: view.status, shot: view.shot, highlight: view.highlight }, plan, cells);
    const next = new Map<string, HTMLElement>();
    for (const label of labels) {
      const element = labelElements.get(label.id) ?? document.createElement("span");
      element.className = `cx-label cx-label--${label.tone} cx-label--${label.side}${label.emphasis ? " is-emphasis" : ""}`;
      element.textContent = label.text;
      next.set(label.id, element);
    }
    labelLayer.replaceChildren(...next.values());
    labelElements = next;
    placeLabels();
  }

  /** Keep pinned labels on their points as the camera moves. */
  function placeLabels(): void {
    for (const label of labels) {
      const element = labelElements.get(label.id);
      const point = element ? renderer.projectContentPoint(label.anchor) : null;
      if (!element) continue;
      if (!point || !point.visible) {
        element.style.opacity = "0";
        continue;
      }
      element.style.opacity = "";
      element.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
    }
  }
  let frame = 0;
  const loop = (): void => {
    if (labels.length > 0) placeLabels();
    frame = requestAnimationFrame(loop);
  };

  // --- page ------------------------------------------------------------------------------
  function render(): void {
    const state = store.getState() as JourneyFlowState;
    const view = buildJourneyView(state, journey, manifest.missions, assessmentItems);
    page.dataset.status = view.status;
    page.dataset.paused = String(view.paused);
    if (ready) {
      syncScene(view);
      syncShot(view);
      renderer.setHighlight(view.highlight);
      syncLabels(view);
    }
    if (view.beat && !view.paused && ready) {
      if (runner.currentBeatId !== view.beat.id) runner.run(view.beat);
    } else {
      runner.stop();
    }
    renderPath(view);
    renderCaption(view);
    renderAsk(view, state);
    renderDock(view);
  }

  function renderPath(view: JourneyView): void {
    const path = part<HTMLElement>(".cx-path");
    path.hidden = view.status === "intro";
    path.replaceChildren(...view.chapters.map((chapter) => {
      const item = document.createElement("li");
      item.dataset.state = chapter.state;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cx-node";
      button.disabled = chapter.command === null;
      if (chapter.command) button.dataset.command = chapter.command;
      button.setAttribute("aria-label", `Chapter ${chapter.index + 1}: ${chapter.title}${chapter.state === "done" ? ", done" : chapter.state === "current" ? ", current" : ""}`);
      if (chapter.state === "current") button.setAttribute("aria-current", "step");
      button.innerHTML = `<span class="cx-node-dot" aria-hidden="true"></span><span class="cx-node-title"></span>`;
      button.querySelector(".cx-node-title")!.textContent = chapter.title;
      item.append(button);
      return item;
    }));
  }

  function renderCaption(view: JourneyView): void {
    const caption = part<HTMLElement>(".cx-caption");
    caption.querySelector("small")!.textContent = view.beat ? `${view.chapterLabel} · ${view.chapterTitle.toUpperCase()}` : "";
    // While a beat's line is spoken, the caption follows it sentence by sentence.
    const spoken = view.beat && narrationView?.currentCueId === view.beat.cueId ? narrationView.captionText : "";
    caption.querySelector("span")!.textContent = spoken || view.beat?.captionText || "";
    caption.hidden = view.beat === null || narrationView?.settings.captionsEnabled === false;
  }

  /** The dock's sound and captions buttons follow the narration player. */
  function renderSound(): void {
    const sound = page.querySelector<HTMLButtonElement>('[data-command="sound:toggle"]');
    if (sound) {
      const on = narrationView?.audioEnabled === true && !narrationView.settings.muted;
      const label = narrationView?.audioUnavailable ? "Sound unavailable" : !narrationView?.audioEnabled ? "Turn sound on" : on ? "Mute narration" : "Unmute narration";
      sound.setAttribute("aria-label", label);
      sound.title = label;
      sound.setAttribute("aria-pressed", String(on));
      sound.disabled = narrationView?.audioUnavailable === true;
      sound.innerHTML = on ? ICON.sound : ICON.muted;
    }
    const captions = page.querySelector<HTMLButtonElement>('[data-command="captions:toggle"]');
    if (captions) {
      const enabled = narrationView?.settings.captionsEnabled !== false;
      captions.setAttribute("aria-label", enabled ? "Hide captions" : "Show captions");
      captions.title = captions.getAttribute("aria-label") ?? "";
      captions.setAttribute("aria-pressed", String(enabled));
    }
    const caption = part<HTMLElement>(".cx-caption");
    if (narrationView?.settings.captionsEnabled === false) caption.hidden = true;
    else caption.hidden = caption.querySelector("span")?.textContent === "";
  }

  function renderAsk(view: JourneyView, state: JourneyFlowState): void {
    const ask = part<HTMLElement>(".cx-ask");
    const answers = part<HTMLElement>(".cx-answers");
    const actions = part<HTMLElement>(".cx-ask-actions");
    const set = (selector: string, text: string) => {
      const element = part<HTMLElement>(selector);
      element.textContent = text;
      element.hidden = text === "";
    };
    const checkpoint = view.checkpoint;
    const question = view.questions;
    ask.hidden = !checkpoint && !question && view.status !== "finished";
    ask.dataset.kind = checkpoint ? checkpoint.kind : question ? "question" : "summary";
    const buttons: HTMLButtonElement[] = [];
    const optionButtons: HTMLButtonElement[] = [];
    if (checkpoint) {
      set(".cx-ask-step", `${view.chapterLabel} · CHECKPOINT`);
      set(".cx-ask-prompt", checkpoint.prompt);
      set(".cx-ask-note", checkpoint.kind === "tap" && !checkpoint.solved ? "Tap the model to answer. Drag to turn it." : "");
      for (const option of checkpoint.options) {
        const button = pill(option.label.replace(/^[A-D]\. /, ""), option.command);
        button.dataset.state = option.state;
        button.disabled = option.disabled;
        optionButtons.push(button);
      }
      set(".cx-ask-feedback", checkpoint.feedback);
      part<HTMLElement>(".cx-ask-feedback").dataset.tone = checkpoint.solved ? "right" : "wrong";
      set(".cx-ask-hint", checkpoint.hintText ? `Hint: ${checkpoint.hintText}` : "");
      if (checkpoint.hint) {
        const hint = pill(checkpoint.hint.label, checkpoint.hint.command);
        hint.disabled = !checkpoint.hint.enabled;
        buttons.push(hint);
      }
      if (checkpoint.continue) buttons.push(pill(checkpoint.continue.label, checkpoint.continue.command, true));
    } else if (question) {
      set(".cx-ask-step", question.step);
      set(".cx-ask-prompt", question.prompt);
      set(".cx-ask-note", "");
      for (const option of question.options) {
        const button = pill(option.label.replace(/^[A-D]\. /, ""), option.command);
        button.dataset.state = option.state;
        button.disabled = option.disabled;
        optionButtons.push(button);
      }
      set(".cx-ask-feedback", question.feedback);
      part<HTMLElement>(".cx-ask-feedback").dataset.tone = question.feedback.startsWith("Correct") ? "right" : "wrong";
      set(".cx-ask-hint", "");
      if (question.continueLabel) buttons.push(pill(question.continueLabel, question.continueCommand, true));
    } else if (view.status === "finished") {
      set(".cx-ask-step", "JOURNEY COMPLETE");
      set(".cx-ask-prompt", "You explored both cells");
      set(".cx-ask-note", `${state.questionsCorrect} of ${state.questionsAnswered} questions right. Tap any part of a cell to see its name.`);
      set(".cx-ask-feedback", "");
      set(".cx-ask-hint", "");
      if (view.controls.replay) buttons.push(pill(view.controls.replay.label, view.controls.replay.command));
      if (options.onExit) {
        const back = pill("Back to the Universe", "");
        back.dataset.appAction = "exit";
        delete back.dataset.command;
        buttons.push(back);
      }
    }
    answers.replaceChildren(...optionButtons);
    answers.hidden = optionButtons.length === 0;
    actions.replaceChildren(...buttons);
  }

  function renderDock(view: JourneyView): void {
    const dock = part<HTMLElement>(".cx-dock");
    const items: HTMLButtonElement[] = [];
    const playPause = view.status === "intro" ? null : view.controls.playPause;
    if (playPause) items.push(iconButton(playPause.label, playPause.command, view.paused ? ICON.play : ICON.pause));
    if (view.controls.skip) items.push(iconButton(view.controls.skip.label, view.controls.skip.command, ICON.skip));
    if (view.controls.replay && view.status !== "finished") items.push(iconButton(view.controls.replay.label, view.controls.replay.command, ICON.replay));
    if (view.status !== "intro") items.push(iconButton("Reset view", "view:reset", ICON.view));
    items.push(iconButton("Turn sound on", "sound:toggle", ICON.muted), iconButton("Hide captions", "captions:toggle", ICON.captions));
    dock.replaceChildren(...items);
    renderSound();
  }

  /** Show what was tapped, for free exploring (outside tap checkpoints). */
  function showName(target: string): void {
    const pick = parseCellTarget(target);
    let text = "";
    if (pick?.kind === "cell") {
      const name = organelleById(pick.organelle as OrganelleId).name;
      text = `${pick.cellId === "plant" ? "Plant cell" : "Animal cell"}: ${name}`;
    } else if (pick?.kind === "detail") {
      const organelle = organelleById(pick.detailId as OrganelleId);
      const named = organellePart(organelle.id, pick.part as OrganellePartId);
      text = `${organelle.name}: ${named?.name ?? pick.part}${named?.note ? `, ${named.note}` : ""}`;
    }
    const name = part<HTMLElement>(".cx-name");
    name.textContent = text;
    name.classList.toggle("is-shown", text !== "");
    if (nameTimer !== undefined) clearTimeout(nameTimer);
    nameTimer = setTimeout(() => name.classList.remove("is-shown"), 2600);
  }

  // --- input -----------------------------------------------------------------------------
  const onInput = (action: InputAction): void => {
    const payload = (typeof action.payload === "object" && action.payload !== null && !Array.isArray(action.payload)
      ? action.payload
      : {}) as Record<string, unknown>;
    if (action.type === "rotate" && typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
      renderer.rotate(payload.deltaX, payload.deltaY);
    } else if (action.type === "scale" && typeof payload.delta === "number") {
      renderer.scale(payload.delta);
    } else if (action.type === "select" && typeof payload.target === "string") {
      const state = store.getState() as JourneyFlowState;
      const tapCheckpoint = state.journey.status === "checkpoint" && journey.chapters[state.journey.chapterIndex]?.checkpoint?.kind === "tap";
      if (tapCheckpoint) dispatch(journeyTapAction(payload.target));
      else if (state.journey.status !== "intro") showName(payload.target);
    }
  };
  const input = new ScreenInputAdapter({
    root: stage,
    dispatch: onInput,
    pickTarget: (x, y, source, pointerType) => renderer.pickTarget(x, y, source, pointerType),
    touch: {
      pinchSensitivity: screenZoomConfig.pinchSensitivity,
      pinchDeadZonePx: arTouchGestureConfig.pinchDeadZonePx,
      dragThresholdPx: arTouchGestureConfig.dragThresholdPx,
    },
  });

  const onClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-command], [data-app-action]");
    if (!target) return;
    if (target.dataset.appAction === "exit") {
      options.onExit?.();
      return;
    }
    const command = target.dataset.command;
    if (command === "sound:toggle") {
      if (!narrationView?.audioEnabled) void narration.enableSound();
      else narration.toggleMuted();
      return;
    }
    if (command === "captions:toggle") {
      narration.toggleCaptions();
      return;
    }
    if (command === "journey:play" && (store.getState() as JourneyFlowState).journey.status === "intro") {
      // Starting is a tap, so sound can be switched on now and the first line spoken.
      void narration.enableSound().finally(() => dispatch(journeyCommandToAction(command)!));
      return;
    }
    if (command === "view:reset") {
      syncShot(buildJourneyView(store.getState() as JourneyFlowState, journey, manifest.missions, assessmentItems), true);
      return;
    }
    const action = command ? journeyCommandToAction(command) : null;
    if (action) dispatch(action);
  };
  page.addEventListener("click", onClick);
  part<HTMLElement>(".cx-back").hidden = !options.onExit;

  const resize = new ResizeObserver(() => {
    if (!ready) return;
    render();
  });
  resize.observe(stage);

  const unsubscribe = store.subscribe(() => render());
  void renderer.ready.then(() => {
    ready = true;
    render();
    frame = requestAnimationFrame(loop);
  });
  render();
  store.events.emit("module_started", { type: "module_started", payload: { moduleId: manifest.id } });

  return () => {
    cancelAnimationFrame(frame);
    if (nameTimer !== undefined) clearTimeout(nameTimer);
    runner.stop();
    narration.dispose();
    unsubscribe();
    resize.disconnect();
    page.removeEventListener("click", onClick);
    input.dispose();
    disposeZoom();
    renderer.dispose();
    cellView.dispose();
    root.replaceChildren();
  };
}

function pill(label: string, command: string, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cx-pill${primary ? " cx-pill--primary" : ""}`;
  button.textContent = label;
  if (command) button.dataset.command = command;
  return button;
}

function iconButton(label: string, command: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cx-icon";
  button.dataset.command = command;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = icon;
  return button;
}
