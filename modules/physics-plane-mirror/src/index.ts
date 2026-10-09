import { createStore, matchesPartialState } from "@mma/engine-core";
import type { ExperienceStep, GuidedAction, GuidedState } from "@mma/engine-guided";
import {
  AngleArc,
  BeamLine,
  createPlaneMapper,
  LabelSprite,
  LabStage,
  PointMarker,
  ScreenInputAdapter,
  visualTokens,
  type InputAction,
} from "@mma/engine-render";
import {
  AmbientLight,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import {
  createPlaneMirrorGuidedState,
  planeMirrorExperience,
  planeMirrorExperienceCopy,
  planeMirrorManifest,
  reducePlaneMirrorGuidedAction,
  restorePlaneMirrorGuidedState,
  toPlaneMirrorGuidedModuleState,
} from "./guided.js";
import {
  createPlaneMirrorReducer,
  createPlaneMirrorState,
  derivePlaneMirrorScene,
  MAX_SOURCE_DISTANCE,
  MIN_SOURCE_DISTANCE,
  type PlaneMirrorState,
} from "./learning.js";
import "./plane-mirror.css";

/** Validated manifest for the screen-mode plane-mirror module. */
export const manifest = planeMirrorManifest;

/** Mount-time options accepted by the plane-mirror module. */
export interface PlaneMirrorOptions {
  readonly diagnostics?: boolean;
}

/** Mount the interactive plane-mirror scene and release all owned resources on teardown. */
export function mountPlaneMirror(root: HTMLElement, options: PlaneMirrorOptions = {}): () => void {
  const guidedStorageKey = `mma-guided:${manifest.id}`;
  const savedGuidedState = window.localStorage.getItem(guidedStorageKey);
  let guidedState: GuidedState = savedGuidedState === null
    ? createPlaneMirrorGuidedState()
    : restorePlaneMirrorGuidedState(JSON.parse(savedGuidedState));
  root.innerHTML = `
    <main class="plane-mirror" aria-label="Reflection from a plane mirror">
      <header class="builder-header plane-mirror-header">
        <div>
          <p>PHYSICS / LIGHT &amp; MIRRORS</p>
          <h1>Reflection from a plane mirror</h1>
          <p>Move the light source and follow the rays to its virtual image.</p>
        </div>
      </header>
      <section class="plane-mirror-guided" aria-label="Guided walkthrough">
        <div class="plane-mirror-guided-copy">
          <p class="plane-mirror-guided-progress" data-guided-progress></p>
          <h2 data-guided-title></h2>
          <p data-guided-prompt></p>
        </div>
        <div class="plane-mirror-guided-actions" data-guided-actions></div>
        <div class="plane-mirror-guided-footer">
          <p data-guided-status role="status" aria-live="polite"></p>
          <button type="button" data-guided-hint>Hint</button>
          <button type="button" data-guided-mode></button>
        </div>
      </section>
      <section class="plane-mirror-content">
        <div class="scene-viewport plane-mirror-view" aria-label="Plane-mirror lab">
          <canvas aria-label="Top-down plane-mirror scene"></canvas>
          <button class="plane-mirror-source-handle" type="button" data-particle="light-source" aria-label="Move light source"></button>
        </div>
        <aside class="plane-mirror-controls" aria-label="Scene controls">
          <h2>Move the source</h2>
          <p>Drag the light or use the distance control. The image stays the same distance behind the mirror.</p>
          <label for="plane-mirror-distance">
            Source distance from mirror
            <input id="plane-mirror-distance" type="range" min="${MIN_SOURCE_DISTANCE}" max="${MAX_SOURCE_DISTANCE}" step="0.1" value="1.8">
          </label>
          <p id="plane-mirror-distance-readout" aria-live="polite"></p>
          <dl class="plane-mirror-readouts">
            <dt>Angle of incidence</dt><dd id="plane-mirror-incidence"></dd>
            <dt>Angle of reflection</dt><dd id="plane-mirror-reflection"></dd>
          </dl>
          <div class="plane-mirror-legend" aria-label="Scene key">
            <span class="plane-mirror-key plane-mirror-key--direct"><span class="plane-mirror-swatch"></span>Visible rays</span>
            <span class="plane-mirror-key plane-mirror-key--virtual"><span class="plane-mirror-swatch"></span>Virtual ray</span>
          </div>
          <p>The dashed path continues behind the mirror. The hollow marker shows the virtual image.</p>
        </aside>
      </section>
    </main>
  `;

  const view = requiredElement<HTMLElement>(root, ".plane-mirror-view");
  const canvas = requiredElement<HTMLCanvasElement>(view, "canvas");
  const sourceHandle = requiredElement<HTMLButtonElement>(view, ".plane-mirror-source-handle");
  const distanceControl = requiredElement<HTMLInputElement>(root, "#plane-mirror-distance");
  const distanceReadout = requiredElement<HTMLElement>(root, "#plane-mirror-distance-readout");
  const incidenceReadout = requiredElement<HTMLElement>(root, "#plane-mirror-incidence");
  const reflectionReadout = requiredElement<HTMLElement>(root, "#plane-mirror-reflection");
  const guidedProgress = requiredElement<HTMLElement>(root, "[data-guided-progress]");
  const guidedTitle = requiredElement<HTMLElement>(root, "[data-guided-title]");
  const guidedPrompt = requiredElement<HTMLElement>(root, "[data-guided-prompt]");
  const guidedActions = requiredElement<HTMLElement>(root, "[data-guided-actions]");
  const guidedStatus = requiredElement<HTMLElement>(root, "[data-guided-status]");
  const guidedHint = requiredElement<HTMLButtonElement>(root, "[data-guided-hint]");
  const guidedMode = requiredElement<HTMLButtonElement>(root, "[data-guided-mode]");
  const scene = new Scene();
  const camera = new OrthographicCamera(-4, 4, 3.8, -3.8, 0.1, 100);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 14, 0);
  camera.lookAt(0, 0, 0);
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: options.diagnostics ?? false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  scene.add(new AmbientLight(visualTokens.labelColor, visualTokens.galleryAmbientIntensity));
  const stage = new LabStage({ mapper: createPlaneMapper({ scale: 1, origin: [0, visualTokens.stageTableHeight, 0] }) });
  stage.setGridVisible(true);
  scene.add(stage.group);
  stage.setMode("opaque");

  const mapper = createPlaneMapper({
    scale: 1,
    origin: [0, visualTokens.stageTableHeight + visualTokens.stageGridLift * 2, 0],
  });
  const mirror = new BeamLine({
    mapper,
    tokens: { ...visualTokens, solidBeamColor: 0xb7c8d8, beamWidth: 0.12 },
  });
  mirror.setPoints([[0, -2.5], [0, 2.5]], "solid");
  const incidentBeam = new BeamLine({ mapper });
  const reflectedBeam = new BeamLine({ mapper });
  const virtualBeam = new BeamLine({ mapper });
  const normalBeam = new BeamLine({
    mapper,
    tokens: { ...visualTokens, solidBeamColor: visualTokens.arcColor },
  });
  const incidenceArc = new AngleArc({ mapper });
  const reflectionArc = new AngleArc({ mapper });
  const incidentLabel = new LabelSprite();
  const reflectedLabel = new LabelSprite();
  const normalLabel = new LabelSprite();
  incidentLabel.setText("Incident ray");
  reflectedLabel.setText("Reflected ray");
  normalLabel.setText("Normal");
  const objectMarker = new PointMarker({ kind: "object", mapper, createCanvas });
  const eyeMarker = new PointMarker({ kind: "eye", mapper, createCanvas });
  const imageMarker = new PointMarker({ kind: "image", mapper, createCanvas });
  objectMarker.setLabel("Light source");
  eyeMarker.setLabel("Eye");
  imageMarker.setLabel("Virtual image");
  scene.add(
    mirror.mesh,
    incidentBeam.mesh,
    reflectedBeam.mesh,
    virtualBeam.mesh,
    normalBeam.mesh,
    incidenceArc.beam.mesh,
    reflectionArc.beam.mesh,
    incidentLabel.sprite,
    reflectedLabel.sprite,
    normalLabel.sprite,
    objectMarker.mesh,
    eyeMarker.mesh,
    imageMarker.mesh,
  );

  const store = createStore(createPlaneMirrorReducer(), createPlaneMirrorState());
  const activeStep = (): ExperienceStep | undefined =>
    planeMirrorExperience.steps.find(({ id }) => id === guidedState.currentStepId);
  const copy = (key: string): string => {
    const value = planeMirrorExperienceCopy[key];
    const text = value?.[guidedState.activeLevel ?? "basic"] ?? value?.default;
    if (!text) {
      throw new Error(`Plane-mirror guided copy is missing: ${key}`);
    }
    return text;
  };
  const saveGuidedState = (): void => {
    window.localStorage.setItem(guidedStorageKey, JSON.stringify(guidedState));
  };
  const renderGuided = (): void => {
    const step = activeStep();
    const inPlayground = guidedState.mode === "playground";
    const completed = guidedState.currentStepId === null;
    guidedProgress.textContent =
      `${guidedState.completedCount} of ${planeMirrorExperience.steps.length} steps complete`;
    guidedTitle.textContent = step
      ? copy(step.titleKey ?? "")
      : "Walkthrough complete";
    guidedPrompt.textContent = inPlayground
      ? "Playground mode is active. Experiment freely, then return to your saved step."
      : step
        ? copy(step.promptKey ?? "")
        : "You can continue experimenting in Playground.";
    guidedActions.replaceChildren();
    guidedStatus.textContent = "";
    guidedHint.hidden = inPlayground || completed || !step;
    guidedMode.textContent = inPlayground ? "Return to guided walkthrough" : "Switch to Playground";

    if (!step || inPlayground) {
      return;
    }

    if (step.type === "predict" || step.type === "conclude") {
      for (const optionId of step.options) {
        guidedActions.append(makeGuidedButton(copy(optionId), () => {
          updateGuided({
            type: step.type === "predict" ? "answerPrediction" : "answerConclusion",
            optionId,
          });
        }));
      }
      if (step.type === "conclude" && guidedState.steps[step.id]?.answer !== null) {
        guidedStatus.textContent = "That does not match the observed angles. Try again.";
      }
    } else if (step.type === "measure") {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "180";
      input.step = "0.1";
      input.value = String(guidedState.measurements[step.id] ?? "");
      input.setAttribute("aria-label", `Angle difference in ${step.unit}`);
      guidedActions.append(
        input,
        makeGuidedButton("Submit measurement", () => {
          const value = input.value === "" ? Number.NaN : Number(input.value);
          updateGuided({ type: "submitMeasurement", value });
          if (guidedState.currentStepId === step.id) {
            guidedStatus.textContent = "The value does not match the displayed readouts. Try again.";
          }
        }),
      );
    } else if (step.type === "table") {
      for (const row of step.requiredRows) {
        const label = document.createElement("label");
        label.textContent = copy(`${row.id}-label`);
        const select = document.createElement("select");
        select.setAttribute("aria-label", label.textContent);
        select.append(
          makeGuidedOption("", "Choose an observation"),
          makeGuidedOption("equal", copy("equal")),
          makeGuidedOption("different", copy("different")),
        );
        const previousValue = guidedState.tableRows[step.id]?.[row.id];
        if (typeof previousValue === "string") {
          select.value = previousValue;
        }
        select.addEventListener("change", () => {
          if (select.value !== "") {
            updateGuided({ type: "fillTableRow", rowId: row.id, value: select.value });
          }
        });
        label.append(select);
        guidedActions.append(label);
      }
    } else if (step.type === "narrate" || step.type === "check") {
      guidedActions.append(makeGuidedButton("Continue", () => updateGuided({ type: "continue" })));
    }
  };
  const updateGuided = (action: GuidedAction): void => {
    guidedState = reducePlaneMirrorGuidedAction(guidedState, action);
    saveGuidedState();
    renderGuided();
    evaluateManipulation(store.getState());
  };
  const evaluateManipulation = (state: Readonly<PlaneMirrorState>): void => {
    const step = activeStep();
    if (
      guidedState.mode === "guided" &&
      step?.type === "manipulate" &&
      matchesPartialState(toPlaneMirrorGuidedModuleState(state), step.goal)
    ) {
      updateGuided({
        type: "evaluateManipulation",
        moduleState: toPlaneMirrorGuidedModuleState(state),
      });
    }
  };
  const onGuidedHint = (): void => {
    const step = activeStep();
    if (!step) {
      return;
    }
    const before = guidedState.steps[step.id]?.hintsUsed ?? 0;
    updateGuided({ type: "useHint" });
    guidedStatus.textContent = copy(step.hints[Math.min(before, 2)] ?? "");
  };
  guidedHint.addEventListener("click", onGuidedHint);
  guidedMode.addEventListener("click", () => {
    updateGuided({
      type: guidedState.mode === "guided" ? "enterPlayground" : "returnToGuided",
    });
  });
  renderGuided();
  const renderState = (state: Readonly<PlaneMirrorState>): void => {
    const model = derivePlaneMirrorScene(state);
    const hit = model.hit;
    const reflectedLength = Math.hypot(model.eye.x - hit.x, model.eye.y - hit.y);
    const reflectedEnd = {
      x: hit.x + model.reflectedDirection.x * reflectedLength,
      y: hit.y + model.reflectedDirection.y * reflectedLength,
    };
    incidentBeam.setPoints([asPoint(model.object), asPoint(hit)], "solid");
    reflectedBeam.setPoints([asPoint(hit), asPoint(reflectedEnd)], "solid");
    virtualBeam.setPoints([asPoint(hit), asPoint(model.image)], "dotted");
    normalBeam.setPoints([
      asPoint(hit),
      [
        hit.x + model.normal.x * 0.85,
        hit.y + model.normal.y * 0.85,
      ],
    ], "solid");
    incidentLabel.setPosition(mapper.toScene(
      (model.object.x + hit.x) / 2,
      (model.object.y + hit.y) / 2 + 0.22,
    ));
    reflectedLabel.setPosition(mapper.toScene(
      (hit.x + model.eye.x) / 2,
      (hit.y + model.eye.y) / 2 - 0.22,
    ));
    normalLabel.setPosition(mapper.toScene(
      hit.x + model.normal.x * 1.05,
      hit.y + 0.28,
    ));
    objectMarker.setPosition(model.object.x, model.object.y);
    eyeMarker.setPosition(model.eye.x, model.eye.y);
    imageMarker.setPosition(model.image.x, model.image.y);
    incidenceArc.set(
      [hit.x, hit.y],
      [model.normal.x, model.normal.y],
      [model.object.x - hit.x, model.object.y - hit.y],
      model.angleOfIncidence,
    );
    reflectionArc.set(
      [hit.x, hit.y],
      [model.normal.x, model.normal.y],
      [model.reflectedDirection.x, model.reflectedDirection.y],
      model.angleOfReflection,
    );
    distanceControl.value = String(state.sourceDistance);
    distanceReadout.textContent =
      `Source: ${formatDistance(state.sourceDistance)} units; image: ${formatDistance(Math.abs(model.image.x))} units behind the mirror.`;
    incidenceReadout.textContent = `${formatAngle(model.angleOfIncidence)}°`;
    reflectionReadout.textContent = `${formatAngle(model.angleOfReflection)}°`;
    const sourceScreenX = ((model.object.x - camera.left) / (camera.right - camera.left)) * 100;
    const sourceScreenY = ((camera.top - model.object.y) / (camera.top - camera.bottom)) * 100;
    sourceHandle.style.left = `${sourceScreenX}%`;
    sourceHandle.style.top = `${sourceScreenY}%`;
  };

  const dispatchMove = (sourceDistance: number): void => {
    store.dispatch({ type: "object/move", payload: { distance: sourceDistance } });
  };
  const onScreenInput = (action: InputAction): void => {
    if (action.type !== "move" || !isRecord(action.payload)) {
      return;
    }
    if (action.payload.source !== "tray:light-source" || typeof action.payload.x !== "number") {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }
    const normalizedX = (action.payload.x - bounds.left) / bounds.width;
    const worldX = camera.left + normalizedX * (camera.right - camera.left);
    dispatchMove(-worldX);
  };
  const input = new ScreenInputAdapter({
    root,
    dispatch: onScreenInput,
    pickTarget: () => "light-source",
  });
  const onDistanceInput = (): void => {
    const sourceDistance = Number(distanceControl.value);
    if (Number.isFinite(sourceDistance)) {
      dispatchMove(sourceDistance);
    }
  };
  distanceControl.addEventListener("input", onDistanceInput);
  const unsubscribe = store.subscribe((state) => {
    renderState(state);
    evaluateManipulation(state);
  });

  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = view.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
      return;
    }
    const aspect = width / height;
    const frameHeight = Math.max(7.6, 6.6 / aspect);
    camera.left = -(frameHeight * aspect) / 2;
    camera.right = (frameHeight * aspect) / 2;
    camera.top = frameHeight / 2;
    camera.bottom = -frameHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderState(store.getState());
    evaluateManipulation(store.getState());
  });
  resizeObserver.observe(view);

  renderState(store.getState());
  let frame = 0;
  const render = (): void => {
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    unsubscribe();
    input.dispose();
    guidedHint.removeEventListener("click", onGuidedHint);
    distanceControl.removeEventListener("input", onDistanceInput);
    stage.dispose();
    mirror.dispose();
    incidentBeam.dispose();
    reflectedBeam.dispose();
    virtualBeam.dispose();
    normalBeam.dispose();
    incidenceArc.dispose();
    reflectionArc.dispose();
    incidentLabel.dispose();
    reflectedLabel.dispose();
    normalLabel.dispose();
    objectMarker.dispose();
    eyeMarker.dispose();
    imageMarker.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    root.replaceChildren();
  };
}

function makeGuidedButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeGuidedOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function asPoint(point: { readonly x: number; readonly y: number }): readonly [number, number] {
  return [point.x, point.y];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDistance(distance: number): string {
  return distance.toFixed(1);
}

function formatAngle(angle: number): string {
  return (Math.round(angle * 10) / 10).toFixed(1);
}

function requiredElement<ElementType extends HTMLElement>(root: ParentNode, selector: string): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Plane-mirror element not found: ${selector}`);
  }
  return element;
}
