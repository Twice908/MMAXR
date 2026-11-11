import "./model-preview.css";
import { layoutCell, organelleById, organellePart, type CellDensity, type OrganelleId, type OrganellePartId } from "@mma/kit-biology";
import {
  CellView,
  SceneRenderer,
  ScreenInputAdapter,
  installZoomControls,
  parseCellTarget,
  screenZoomConfig,
  type CellSceneFrame,
  type InputAction,
  type ScreenZoomDistances,
} from "@mma/engine-render";
import projectOptions from "virtual:iwsdk-project";

/** Models the preview can show; `?model-preview=<id>` picks one. */
const MODELS = ["cell"] as const;
type ModelId = (typeof MODELS)[number];

const ZOOM: ScreenZoomDistances = { minDistance: 4, maxDistance: 30, defaultDistance: 12 };

/**
 * Developer-only page for checking 3D models before a module uses them: drag to turn,
 * scroll or pinch to zoom, tap a part to name it. It sits outside the student login.
 */
export function mountModelPreview(root: HTMLElement): void {
  const requested = new URLSearchParams(window.location.search).get("model-preview");
  const model: ModelId = MODELS.find((id) => id === requested) ?? "cell";
  root.innerHTML = `
    <main class="model-preview" data-model="${model}">
      <div class="model-preview-stage"></div>
      <header class="model-preview-bar">
        <strong>Model preview</strong>
        <div class="model-preview-tools" role="toolbar" aria-label="Preview options">
          <button type="button" data-view="cells" aria-pressed="true">Cells</button>
          <button type="button" data-view="close-ups" aria-pressed="false">Close-ups</button>
          <button type="button" data-toggle="cutaway" aria-pressed="true">Cut open</button>
          <button type="button" data-toggle="light" aria-pressed="false">Phone detail</button>
        </div>
      </header>
      <p class="model-preview-pick" role="status" aria-live="polite">Tap a part to name it.</p>
    </main>`;
  const stage = root.querySelector<HTMLElement>(".model-preview-stage") as HTMLElement;
  const status = root.querySelector<HTMLElement>(".model-preview-pick") as HTMLElement;

  let view: "cells" | "close-ups" = "cells";
  let cutaway = true;
  let density: CellDensity = "full";
  let cellView = new CellView();
  let renderer = createRenderer();

  function createRenderer(): SceneRenderer {
    const next = new SceneRenderer({ host: stage, content: cellView, screenZoom: ZOOM, worldOptions: projectOptions });
    void next.ready.then(() => {
      draw();
      frameView(next);
    });
    return next;
  }

  /** Fit the models and tilt them a little so their depth and cut-aways read. */
  function frameView(target: SceneRenderer): void {
    target.resetView();
    target.fitToWidth(view === "cells" ? 10.5 : 7);
    target.rotateBy(view === "cells" ? -0.25 : -0.45, 0.35);
  }

  function frame(): CellSceneFrame {
    if (view === "close-ups") {
      return {
        cells: [],
        details: [
          { id: "mitochondrion", organelle: "mitochondrion", position: { x: -1.9, y: 0, z: 0 }, length: 3.2, yaw: 0, cutaway },
          { id: "chloroplast", organelle: "chloroplast", position: { x: 1.9, y: 0, z: 0 }, length: 3.2, yaw: 0, cutaway },
        ],
      };
    }
    return {
      cells: [
        layoutCell("plant", { position: { x: -2.6, y: 0, z: 0 }, density }),
        layoutCell("animal", { position: { x: 2.7, y: 0, z: 0 }, density }),
      ],
      details: [],
    };
  }

  function draw(): void {
    cellView.update(frame());
    renderer.contentChanged();
  }

  const name = (target: string): string => {
    const pick = parseCellTarget(target);
    if (!pick) return target;
    if (pick.kind === "detail") {
      const organelle = organelleById(pick.detailId as OrganelleId);
      const part = organellePart(organelle.id, pick.part as OrganellePartId);
      return `${organelle.name}: ${part?.name ?? pick.part}${part?.note ? ` (${part.note})` : ""}`;
    }
    return `${pick.cellId === "plant" ? "Plant" : "Animal"} cell: ${organelleById(pick.organelle as OrganelleId).name}`;
  };

  const onInput = (action: InputAction): void => {
    const payload = (typeof action.payload === "object" && action.payload !== null ? action.payload : {}) as Record<string, unknown>;
    if (action.type === "rotate" && typeof payload.deltaX === "number" && typeof payload.deltaY === "number") {
      renderer.rotate(payload.deltaX, payload.deltaY);
    } else if (action.type === "scale" && typeof payload.delta === "number") {
      renderer.scale(payload.delta);
    } else if (action.type === "select" && typeof payload.target === "string") {
      renderer.setHighlight(payload.target);
      status.textContent = name(payload.target);
    }
  };

  const input = new ScreenInputAdapter({
    root: stage,
    dispatch: onInput,
    pickTarget: (x, y, source, pointerType) => renderer.pickTarget(x, y, source, pointerType),
  });
  let disposeZoom = installZoomControls(stage, () => renderer.getDistance(), (distance) => renderer.setDistance(distance), { ...screenZoomConfig, ...ZOOM });

  root.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button) return;
    if (button.dataset.view) {
      view = button.dataset.view as typeof view;
      root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      draw();
      frameView(renderer);
    } else if (button.dataset.toggle === "cutaway") {
      cutaway = !cutaway;
      button.setAttribute("aria-pressed", String(cutaway));
      draw();
    } else if (button.dataset.toggle === "light") {
      // Phone detail rebuilds the view at low quality with fewer small parts.
      density = density === "full" ? "light" : "full";
      button.setAttribute("aria-pressed", String(density === "light"));
      disposeZoom();
      renderer.dispose();
      cellView.dispose();
      cellView = new CellView({ quality: density === "light" ? "low" : "high" });
      renderer = createRenderer();
      disposeZoom = installZoomControls(stage, () => renderer.getDistance(), (distance) => renderer.setDistance(distance), { ...screenZoomConfig, ...ZOOM });
    }
    status.textContent = "Tap a part to name it.";
  });

  window.addEventListener("pagehide", () => {
    input.dispose();
    disposeZoom();
    renderer.dispose();
    cellView.dispose();
  });
}
