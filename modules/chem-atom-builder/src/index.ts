import { createStore, type EngineAction, type LearningEventMap } from "@mma/engine-core";
import {
  assessmentItemSchema,
  resolveTriggeredAssessmentItems,
  type AssessmentItem,
} from "@mma/engine-assess";
import {
  calculateCharge,
  calculateMassNumber,
  bohrBuryConfiguration,
  elementByAtomicNumber,
  hasCompleteOuterShell,
} from "@mma/kit-chemistry";
import {
  ScreenInputAdapter,
  ScreenSceneRenderer,
  type InputAction,
} from "@mma/engine-render";
import { moduleManifestSchema } from "@mma/schema";
import carbon12Items from "../assessments/m1-carbon-12.json";
import sodiumItems from "../assessments/m2-sodium-ion.json";
import carbon14Items from "../assessments/m3-carbon-14.json";
import chlorideItems from "../assessments/m4-chloride-ion.json";
import rawManifest from "../module.json";
import {
  createAtomBuilderLearningReducer,
  createAtomBuilderLearningState,
  missionCheckState,
  projectAtomBuilderLearningEvents,
  type AtomBuilderLearningState,
} from "./learning.js";
import { layoutAtom } from "./layout.js";
import "./atom-builder.css";

/** Validated manifest for the screen-mode Atom Builder module. */
export const manifest = moduleManifestSchema.parse(rawManifest);
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
}

/** Mount the Class 9-10 atom builder and return its complete teardown. */
export function mountAtomBuilder(root: HTMLElement, options: AtomBuilderOptions = {}): () => void {
  root.innerHTML = `
    <section class="atom-builder" aria-label="Atom Builder" tabindex="0">
      <header class="builder-header">
        <div class="builder-brand"><span class="brand-mark" aria-hidden="true">M</span><span>Math Maam Academy</span></div>
        <div class="builder-title"><span class="eyebrow">CHEMISTRY / CLASS 9-10</span><h1>Atom Builder</h1></div>
        <button class="reset-atom" type="button" data-command="atom/reset">Reset atom</button>
      </header>
      <section class="lesson-panel" id="lesson-panel" aria-label="Mission">
        <div class="lesson-copy">
          <p class="lesson-step" id="mission-step">Mission 1 of 4</p>
          <h2 id="mission-title">Build carbon-12</h2>
          <p id="mission-goal">Build a neutral carbon atom with 6 protons, 6 neutrons, and 6 electrons.</p>
          <p class="mission-progress" id="mission-progress">Progress 0/4</p>
        </div>
        <div class="lesson-controls">
          <button type="button" data-command="lesson:hint">Hint</button>
          <button type="button" data-command="lesson:check">Check</button>
          <button type="button" data-command="lesson:free-play">Free play</button>
        </div>
        <p class="hint-feedback" id="hint-feedback" aria-live="polite"></p>
        <p class="mission-feedback" id="mission-feedback" aria-live="polite"></p>
      </section>
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
          <div class="rail-heading"><span>PARTICLES</span><span class="rail-rule"></span></div>
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
          <div class="scene-heading"><span>LIVE MODEL</span><button type="button" class="reset-view" data-command="reset-view">Reset view</button></div>
          <div class="scene-viewport" id="atom-scene"></div>
          <output class="chemistry-feedback" id="chemistry-feedback" aria-live="polite"></output>
        </section>
        <aside class="atom-inspector" aria-label="Atom properties">
          <div class="element-summary"><span class="element-symbol" id="element-symbol">H</span><div><h2 id="element-name">Hydrogen</h2><span id="element-number">ELEMENT 01</span></div></div>
          <dl class="property-list">
            <div><dt>Atomic number <span>Z</span></dt><dd id="atomic-number">1</dd></div>
            <div><dt>Mass number <span>A</span></dt><dd id="mass-number">1</dd></div>
            <div><dt>Charge</dt><dd id="atom-charge">0</dd></div>
            <div><dt>Electron configuration</dt><dd id="electron-configuration">1</dd></div>
            <div><dt>Outer shell</dt><dd id="outer-shell">Incomplete</dd></div>
          </dl>
          <div class="inspector-foot"><span class="live-indicator"></span>ATOM STATE</div>
        </aside>
      </div>
      <div class="drag-ghost" id="drag-ghost" aria-hidden="true"></div>
      <details class="dev-event-log" id="dev-event-log" hidden>
        <summary>Local learning events</summary>
        <ol id="dev-event-list"></ol>
      </details>
    </section>
  `;

  const sceneHost = requiredElement<HTMLElement>(root, "#atom-scene");
  const feedback = requiredElement<HTMLOutputElement>(root, "#chemistry-feedback");
  const ghost = requiredElement<HTMLElement>(root, "#drag-ghost");
  const renderer = new ScreenSceneRenderer({
    host: sceneHost,
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
  });
  const reducer = createAtomBuilderLearningReducer(manifest.missions, assessmentItems);
  const store = createStore(reducer, createAtomBuilderLearningState(manifest.missions), {
    telemetry: {
      context: {
        studentRef: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        moduleId: manifest.id,
        moduleVersion: "0.0.0",
        device: { mode: "screen", tier: "mid" },
      },
      clock: () => new Date().toISOString(),
      idGenerator: () => crypto.randomUUID(),
      projectEvents: (action, previousState, nextState) =>
        projectAtomBuilderLearningEvents(manifest.missions, action, previousState, nextState),
    },
  });
  let activeParticle: string | null = null;
  let lastHintText = "";
  const localEvents: LearningEventMap[keyof LearningEventMap][] = [];
  const recordLocalEvent = (event: LearningEventMap[keyof LearningEventMap]): void => {
    localEvents.push(event);
    renderLocalEvents();
  };
  function renderLocalEvents(): void {
    const list = requiredElement<HTMLOListElement>(root, "#dev-event-list");
    list.replaceChildren(...localEvents.slice(-20).map((event) => {
      const entry = document.createElement("li");
      entry.textContent = `${event.type} ${JSON.stringify(event.payload)}`;
      return entry;
    }));
  }
  store.events.subscribe("mission_started", recordLocalEvent);
  store.events.subscribe("mission_completed", recordLocalEvent);
  store.events.subscribe("hint_used", recordLocalEvent);
  store.events.subscribe("assessment_answered", recordLocalEvent);
  requiredElement<HTMLElement>(root, "#dev-event-log").hidden = !options.diagnostics;

  const renderState = (state: Readonly<AtomBuilderLearningState>): void => {
    const chemistry = state.chemistry;
    const element = elementByAtomicNumber(chemistry.protons);
    if (!element) {
      return;
    }
    const electrons = chemistry.shells.reduce((sum, count) => sum + count, 0);
    setText(root, "#proton-count", String(chemistry.protons));
    setText(root, "#neutron-count", String(chemistry.neutrons));
    setText(root, "#electron-count", String(electrons));
    setText(root, "#element-symbol", element.symbol);
    setText(root, "#element-name", element.name);
    setText(root, "#element-number", `ELEMENT ${String(element.atomicNumber).padStart(2, "0")}`);
    setText(root, "#atomic-number", String(element.atomicNumber));
    setText(root, "#mass-number", String(calculateMassNumber(chemistry.protons, chemistry.neutrons)));
    setText(root, "#atom-charge", formatCharge(calculateCharge(chemistry.protons, electrons)));
    setText(root, "#electron-configuration", chemistry.shells.join(",") || "0");
    setText(root, "#outer-shell", hasCompleteOuterShell(chemistry.shells) ? "Complete" : "Incomplete");
    feedback.textContent = chemistry.validationMessages[0] ?? "";
    feedback.classList.toggle("is-visible", chemistry.validationMessages.length > 0);
    renderer.update(layoutAtom(chemistry));
    renderLearningState(root, state, assessmentItems, assessmentsById, lastHintText);
  };

  const dispatchLearningAction = (action: EngineAction): void => store.dispatch(action);

  const onInput = (action: InputAction): void => {
    const payload = asPayload(action.payload);
    switch (action.type) {
      case "grab": {
        activeParticle = typeof payload.source === "string" ? payload.source : null;
        ghost.textContent = activeParticle?.replace("tray:", "") ?? "";
        ghost.classList.toggle("is-visible", activeParticle !== null);
        break;
      }
      case "move": {
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
        break;
      case "rotate":
        if (typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
          renderer.rotate(payload.deltaX, payload.deltaY);
        }
        break;
      case "scale":
        if (typeof payload.delta === "number") {
          renderer.scale(payload.delta);
        }
        break;
      case "confirm":
        {
          const command = typeof payload.command === "string" ? payload.command : "";
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
  const input = new ScreenInputAdapter({
    root,
    dispatch: onInput,
    pickTarget: (x, y) => renderer.pickTarget(x, y),
  });
  renderState(store.getState());
  store.dispatch({ type: "mission/start", payload: { missionId: manifest.missions[0]?.id ?? "" } });

  return () => {
    input.dispose();
    unsubscribe();
    renderer.dispose();
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
  renderer: ScreenSceneRenderer,
): void {
  if (command === "reset-view") {
    renderer.resetView();
    return;
  }
  if (command === "atom/reset") {
    dispatch({ type: "atom/reset", payload: null });
    return;
  }
  if (command === "lesson:hint") {
    dispatch({ type: "mission/hint", payload: null });
    return;
  }
  if (command === "lesson:check") {
    dispatch({ type: "mission/check", payload: { state: missionCheckState(state.chemistry) } });
    return;
  }
  if (command === "lesson:free-play") {
    dispatch({ type: "mode/free-play", payload: null });
    return;
  }
  if (command === "lesson:assessment:continue") {
    dispatch({ type: "assessment/continue", payload: null });
    return;
  }
  const answerMatch = /^lesson:assessment:answer:([0-3])$/.exec(command);
  if (answerMatch) {
    dispatch({
      type: "assessment/answer",
      payload: { selectedOptionIndex: Number(answerMatch[1]) },
    });
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

function asPayload(payload: InputAction["payload"]): Record<string, string | number | null> {
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