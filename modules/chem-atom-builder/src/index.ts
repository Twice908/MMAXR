import { createStore } from "@mma/engine-core";
import {
  calculateCharge,
  calculateMassNumber,
  bohrBuryConfiguration,
  chemistryReducer,
  createChemistryState,
  elementByAtomicNumber,
  hasCompleteOuterShell,
  type ChemistryAction,
  type ChemistryState,
} from "@mma/kit-chemistry";
import {
  ScreenInputAdapter,
  ScreenSceneRenderer,
  type InputAction,
} from "@mma/engine-render";
import { moduleManifestSchema } from "@mma/schema";
import rawManifest from "../module.json";
import { layoutAtom } from "./layout.js";
import "./atom-builder.css";

/** Validated manifest for the screen-mode Atom Builder module. */
export const manifest = moduleManifestSchema.parse(rawManifest);

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
    </section>
  `;

  const sceneHost = requiredElement<HTMLElement>(root, "#atom-scene");
  const feedback = requiredElement<HTMLOutputElement>(root, "#chemistry-feedback");
  const ghost = requiredElement<HTMLElement>(root, "#drag-ghost");
  const renderer = new ScreenSceneRenderer({
    host: sceneHost,
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
  });
  const store = createStore(chemistryReducer, createChemistryState(1, 0));
  let activeParticle: string | null = null;

  const renderState = (state: Readonly<ChemistryState>): void => {
    const element = elementByAtomicNumber(state.protons);
    if (!element) {
      return;
    }
    const electrons = state.shells.reduce((sum, count) => sum + count, 0);
    setText(root, "#proton-count", String(state.protons));
    setText(root, "#neutron-count", String(state.neutrons));
    setText(root, "#electron-count", String(electrons));
    setText(root, "#element-symbol", element.symbol);
    setText(root, "#element-name", element.name);
    setText(root, "#element-number", `ELEMENT ${String(element.atomicNumber).padStart(2, "0")}`);
    setText(root, "#atomic-number", String(element.atomicNumber));
    setText(root, "#mass-number", String(calculateMassNumber(state.protons, state.neutrons)));
    setText(root, "#atom-charge", formatCharge(calculateCharge(state.protons, electrons)));
    setText(root, "#electron-configuration", state.shells.join(",") || "0");
    setText(root, "#outer-shell", hasCompleteOuterShell(state.shells) ? "Complete" : "Incomplete");
    feedback.textContent = state.validationMessages[0] ?? "";
    feedback.classList.toggle("is-visible", state.validationMessages.length > 0);
    renderer.update(layoutAtom(state));
  };

  const dispatchChemistry = (action: ChemistryAction): void => store.dispatch(action);

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
        applyDrop(activeParticle, typeof payload.target === "string" ? payload.target : null, dispatchChemistry);
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
        applyCommand(typeof payload.command === "string" ? payload.command : "", store.getState(), dispatchChemistry, renderer);
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
    if (state.validationMessages.length > 0 && activeParticle) {
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
  dispatch: (action: ChemistryAction) => void,
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
  state: Readonly<ChemistryState>,
  dispatch: (action: ChemistryAction) => void,
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
    dispatch({ type: "electron/remove", payload: { shell: Math.max(1, state.shells.length) } });
    return;
  }
  if (particle === "electron" && operation === "add") {
    const count = state.shells.reduce((sum, shellCount) => sum + shellCount, 0);
    const shell = count >= 20 ? 4 : nextElectronShell(state.shells, count);
    dispatch({ type: "electron/place", payload: { shell } });
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