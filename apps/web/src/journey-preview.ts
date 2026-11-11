import "./model-preview.css";
import type { MissionDefinition } from "@mma/engine-core";
import {
  buildJourneyView,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyBeatEndedAction,
  journeyCommandToAction,
  journeyTapAction,
  type JourneyFlowState,
  type JourneyView,
} from "@mma/engine-lesson";
import { JourneyBeatRunner } from "@mma/engine-voice";
import { layoutCell } from "@mma/kit-biology";
import {
  CellView,
  SceneRenderer,
  ScreenInputAdapter,
  installZoomControls,
  screenZoomConfig,
  type CameraShot,
  type CellSceneFrame,
  type InputAction,
  type ScreenZoomDistances,
} from "@mma/engine-render";
import type { JourneyDefinition } from "@mma/schema";
import projectOptions from "virtual:iwsdk-project";

// Placeholder text for trying the journey engine only. The real chapters, wording and
// narration come with the Cell Explorer module and the teacher's review.
const MISSIONS: readonly MissionDefinition[] = [
  { id: "demo-meet", title: "Meet the cells", goalText: "Demo.", goal: { chapter: "meet" }, hints: ["Demo hint: look at the outer edge.", "Demo hint: the box-shaped cell has it."] },
  { id: "demo-power", title: "Power", goalText: "Demo.", goal: { chapter: "power" }, hints: ["Demo hint: look at both cells."] },
];

const JOURNEY: JourneyDefinition = {
  chapters: [
    {
      id: "meet",
      title: "Meet the cells (demo)",
      missionId: "demo-meet",
      beats: [
        { id: "meet-wide", captionText: "Demo: two cells float in front of you.", shot: "wide", durationMs: 3500 },
        { id: "meet-plant", captionText: "Demo: this is the plant cell.", shot: "plant", highlight: "cell:plant:cell-wall", durationMs: 3500 },
        { id: "meet-animal", captionText: "Demo: and this is the animal cell.", shot: "animal", durationMs: 3500 },
      ],
      checkpoint: {
        kind: "tap",
        id: "tap-wall",
        prompt: "Demo: tap the cell wall.",
        explanation: "Demo: that is the cell wall.",
        defaultFeedback: "Demo: not that one. Try the outer edge of the box-shaped cell.",
        correctTargets: ["cell:plant:cell-wall"],
        wrongFeedback: { "cell:plant:cell-membrane": "Demo: close. That is the membrane, just inside the wall." },
      },
    },
    {
      id: "power",
      title: "Power (demo)",
      missionId: "demo-power",
      beats: [
        { id: "power-close", captionText: "Demo: a mitochondrion, opened up.", shot: "detail", highlight: "detail:mitochondrion:cristae", durationMs: 4000 },
        { id: "power-back", captionText: "Demo: back to both cells.", shot: "wide", durationMs: 3000 },
      ],
      checkpoint: {
        kind: "choice",
        id: "which-cells",
        prompt: "Demo: which cells have mitochondria?",
        explanation: "Demo: both cells do.",
        defaultFeedback: "Demo: look at both cells again.",
        options: [{ id: "plant", text: "Plant cells only" }, { id: "animal", text: "Animal cells only" }, { id: "both", text: "Both" }],
        correctOptionId: "both",
        wrongFeedback: {},
      },
    },
  ],
};

const SHOTS: Readonly<Record<string, CameraShot>> = {
  wide: { focus: { x: 0, y: 0, z: 0 }, distance: 12, yaw: -0.25, pitch: 0.3 },
  plant: { focus: { x: -2.6, y: 0, z: 0 }, distance: 7, yaw: -0.45, pitch: 0.35 },
  animal: { focus: { x: 2.7, y: 0, z: 0 }, distance: 7, yaw: 0.35, pitch: 0.3 },
  detail: { focus: { x: 0, y: 0, z: 0 }, distance: 5, yaw: -0.5, pitch: 0.4 },
};
const ZOOM: ScreenZoomDistances = { minDistance: 3, maxDistance: 30, defaultDistance: 12 };

/** Developer-only page that plays a two-chapter placeholder journey over the cell models. */
export function mountJourneyPreview(root: HTMLElement): void {
  root.innerHTML = `
    <main class="model-preview journey-preview">
      <div class="model-preview-stage"></div>
      <header class="journey-preview-head">
        <p class="journey-preview-label"></p>
        <strong class="journey-preview-title"></strong>
        <ol class="journey-preview-chapters" aria-label="Chapters"></ol>
      </header>
      <section class="journey-preview-card" hidden aria-live="polite"></section>
      <p class="journey-preview-caption" aria-live="polite"></p>
      <div class="model-preview-tools journey-preview-controls" role="toolbar" aria-label="Journey controls"></div>
    </main>`;
  const stage = root.querySelector<HTMLElement>(".model-preview-stage") as HTMLElement;
  const slot = (name: string) => root.querySelector<HTMLElement>(`.journey-preview-${name}`) as HTMLElement;

  const reduce = createJourneyFlowReducer(JOURNEY, MISSIONS, []);
  let state: JourneyFlowState = createJourneyFlowState(MISSIONS);
  const cellView = new CellView();
  const renderer = new SceneRenderer({ host: stage, content: cellView, screenZoom: ZOOM, worldOptions: projectOptions });
  const cells = [
    layoutCell("plant", { position: { x: -2.6, y: 0, z: 0 } }),
    layoutCell("animal", { position: { x: 2.7, y: 0, z: 0 } }),
  ];
  let showingDetail: boolean | null = null;
  let lastShot: string | null = null;
  const runner = new JourneyBeatRunner({ narrator: null, onBeatEnded: (beatId) => dispatch(journeyBeatEndedAction(beatId)) });

  function dispatch(action: Parameters<typeof reduce>[1]): void {
    state = reduce(state, action);
    render();
  }

  function stageFor(view: JourneyView): void {
    const detail = view.shot === "detail";
    if (detail !== showingDetail) {
      showingDetail = detail;
      const frame: CellSceneFrame = detail
        ? { cells: [], details: [{ id: "mitochondrion", organelle: "mitochondrion", position: { x: 0, y: 0, z: 0 }, length: 3.2, yaw: 0, cutaway: true }] }
        : { cells, details: [] };
      cellView.update(frame);
      renderer.contentChanged();
    }
    const shotId = view.shot ?? "wide";
    if (shotId !== lastShot) {
      lastShot = shotId;
      renderer.focusOn(SHOTS[shotId] ?? (SHOTS.wide as CameraShot));
    }
    renderer.setHighlight(view.highlight);
  }

  function render(): void {
    const view = buildJourneyView(state, JOURNEY, MISSIONS, []);
    stageFor(view);
    if (view.beat && !view.paused) {
      if (runner.currentBeatId !== view.beat.id) runner.run(view.beat);
    } else {
      runner.stop();
    }
    slot("label").textContent = view.chapterLabel || "JOURNEY DEMO";
    slot("title").textContent = view.chapterTitle || "Plant and animal cells";
    slot("chapters").replaceChildren(...view.chapters.map((chapter) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${chapter.index + 1}`;
      button.title = chapter.title;
      button.dataset.state = chapter.state;
      button.disabled = chapter.command === null;
      if (chapter.command) button.dataset.command = chapter.command;
      item.append(button);
      return item;
    }));
    slot("caption").textContent = view.beat?.captionText ?? "";
    const controls = [view.controls.playPause, view.controls.skip, view.controls.replay].flatMap((control) => (control ? [control] : []));
    slot("controls").replaceChildren(...controls.map((control) => commandButton(control.label, control.command)));

    const card = slot("card");
    const checkpoint = view.checkpoint;
    card.hidden = checkpoint === null;
    if (checkpoint) {
      const parts: HTMLElement[] = [element("p", "journey-preview-prompt", checkpoint.prompt)];
      if (checkpoint.kind === "tap" && !checkpoint.solved) parts.push(element("p", "journey-preview-note", "Tap the model to answer."));
      for (const option of checkpoint.options) {
        const button = commandButton(option.label, option.command);
        button.dataset.state = option.state;
        button.disabled = option.disabled;
        parts.push(button);
      }
      if (checkpoint.feedback) parts.push(element("p", "journey-preview-feedback", checkpoint.feedback));
      if (checkpoint.hintText) parts.push(element("p", "journey-preview-note", `Hint: ${checkpoint.hintText}`));
      if (checkpoint.hint) {
        const hint = commandButton(checkpoint.hint.label, checkpoint.hint.command);
        hint.disabled = !checkpoint.hint.enabled;
        parts.push(hint);
      }
      if (checkpoint.continue) parts.push(commandButton(checkpoint.continue.label, checkpoint.continue.command));
      card.replaceChildren(...parts);
    }
    if (view.status === "finished") slot("caption").textContent = "Demo journey complete.";
  }

  const onInput = (action: InputAction): void => {
    const payload = (typeof action.payload === "object" && action.payload !== null ? action.payload : {}) as Record<string, unknown>;
    if (action.type === "rotate" && typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
      renderer.rotate(payload.deltaX, payload.deltaY);
    } else if (action.type === "scale" && typeof payload.delta === "number") {
      renderer.scale(payload.delta);
    } else if (action.type === "select" && typeof payload.target === "string" && state.journey.status === "checkpoint") {
      dispatch(journeyTapAction(payload.target));
    }
  };
  const input = new ScreenInputAdapter({
    root: stage,
    dispatch: onInput,
    pickTarget: (x, y, source, pointerType) => renderer.pickTarget(x, y, source, pointerType),
  });
  const disposeZoom = installZoomControls(stage, () => renderer.getDistance(), (distance) => renderer.setDistance(distance), { ...screenZoomConfig, ...ZOOM });
  root.addEventListener("click", (event) => {
    const command = (event.target as Element | null)?.closest<HTMLElement>("[data-command]")?.dataset.command;
    const action = command ? journeyCommandToAction(command) : null;
    if (action) dispatch(action);
  });
  void renderer.ready.then(render);
  window.addEventListener("pagehide", () => {
    runner.stop();
    input.dispose();
    disposeZoom();
    renderer.dispose();
    cellView.dispose();
  });
}

function element(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function commandButton(label: string, command: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.command = command;
  return button;
}
