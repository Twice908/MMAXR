import * as THREE from "three";
import { createGlassPanel, type GlassPanel } from "./glass-panel.js";
import type { GlassPanelItem } from "./panel-layout.js";

interface GalleryPanel {
  readonly panel: GlassPanel;
  readonly items: readonly GlassPanelItem[];
  readonly container: THREE.Group;
  readonly toggles: Record<string, boolean>;
  readonly selectedButtons: Set<string>;
  collapsed: boolean;
}

/** Mount an isolated development gallery of spatial glass panel variants. */
export function mountGlassPanelGallery(root: HTMLElement): () => void {
  const host = document.createElement("div");
  host.className = "glass-gallery";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { display:block; width:100%; min-height:100vh; color:#272331; }
      * { box-sizing:border-box; }
      .page { min-height:100vh; padding:20px; font:16px/1.45 "Avenir Next","Trebuchet MS",sans-serif; }
      h1 { margin:0 0 8px; font:700 24px/1.2 Georgia,"Times New Roman",serif; }
      p { margin:0 0 16px; }
      .stage { position:relative; height:min(78vh,760px); min-height:480px; overflow:hidden; border-radius:22px;
        background:linear-gradient(135deg,#fff 0%,#f7e5f2 42%,#272331 58%,#090910 100%); }
      canvas { position:absolute; inset:0; width:100%; height:100%; touch-action:none; }
      .hint { position:absolute; z-index:1; left:12px; bottom:12px; padding:6px 10px; border-radius:10px;
        background:rgba(255,255,255,.85); color:#272331; font-size:14px; pointer-events:none; }
    </style>
    <main class="page">
      <h1>Glass panels</h1>
      <p>Pointer over a panel, then click its surface or a control to change its display state.</p>
      <section class="stage" aria-label="Glass panel scene">
        <canvas aria-label="Interactive glass panel scene"></canvas>
        <span class="hint">Hover and click panels or controls</span>
      </section>
    </main>
  `;
  root.replaceChildren(host);

  const canvas = shadow.querySelector("canvas");
  const stage = shadow.querySelector(".stage");
  if (!(canvas instanceof HTMLCanvasElement) || !(stage instanceof HTMLElement)) {
    throw new Error("Glass panel gallery could not create its scene host.");
  }

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
  camera.position.z = 2.25;

  const panels: GalleryPanel[] = [];
  const addPanel = (
    id: string,
    column: number,
    row: number,
    surface: "uniform" | "framed",
    title: string,
    items: readonly GlassPanelItem[],
    collapsed = false,
  ): void => {
    const panel = createGlassPanel({
      id,
      widthM: 0.48,
      heightM: id.includes("side") ? 0.36 : 0.25,
      surface,
      title,
      items,
      collapsed,
    });
    const container = new THREE.Group();
    container.position.set((column - 1.5) * 0.55, row === 0 ? 0.31 : -0.31, 0);
    container.add(panel.object3d);
    scene.add(container);
    const toggles: Record<string, boolean> = {};
    panels.push({
      panel,
      items,
      container,
      toggles,
      selectedButtons: new Set(),
      collapsed,
    });
  };

  for (const [row, surface] of (["uniform", "framed"] as const).entries()) {
    const suffix = surface === "uniform" ? "uniform" : "framed";
    addPanel(`mission-${suffix}`, 0, row,
      surface, "Mission",
      [
        { kind: "heading", text: "Mission briefing" },
        { kind: "text", text: "Explore the model and notice its details." },
        { kind: "button", text: "Mark ready", inputId: `mission-ready-${suffix}` },
      ]);
    addPanel(`side-collapsed-${suffix}`, 1, row,
      surface, "Details",
      [
        { kind: "heading", text: "Details" },
        { kind: "text", text: "A compact panel summary." },
        { kind: "button", text: "Show more", inputId: `side-expand-${suffix}` },
        { kind: "toggle", text: "Show labels", inputId: `side-labels-${suffix}` },
      ], true);
    addPanel(`side-expanded-${suffix}`, 2, row,
      surface, "Details",
      [
        { kind: "heading", text: "Details" },
        { kind: "text", text: "A longer panel with enough example content for the expanded state." },
        { kind: "button", text: "Show less", inputId: `side-collapse-${suffix}` },
        { kind: "toggle", text: "Show labels", inputId: `side-labels-expanded-${suffix}` },
      ]);
    addPanel(`settings-${suffix}`, 3, row,
      surface, "Settings",
      [
        { kind: "heading", text: "Settings" },
        { kind: "text", text: "Display options for this sample panel." },
        { kind: "toggle", text: "Captions", inputId: `settings-captions-${suffix}` },
        { kind: "toggle", text: "Sound", inputId: `settings-sound-${suffix}` },
      ]);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let activePanel: GalleryPanel | null = null;
  let activeInputId: string | null = null;
  let disposed = false;
  const resize = (): void => {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.position.z = bounds.width < 620 ? 4 : 3.3;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const findHit = (event: PointerEvent): { panel: GalleryPanel; inputId: string | null } | null => {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const panelByMesh = new Map<THREE.Object3D, GalleryPanel>(
      panels.map((entry) => [entry.panel.object3d, entry]),
    );
    const intersection = raycaster.intersectObjects([...panelByMesh.keys()], false)[0];
    if (!intersection?.uv) return null;
    const entry = panelByMesh.get(intersection.object);
    if (!entry) return null;
    return { panel: entry, inputId: entry.panel.hitTest(intersection.uv) };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const hit = findHit(event);
    const nextPanel = hit?.panel ?? null;
    const nextInputId = hit?.inputId ?? null;
    if (activePanel === nextPanel && activeInputId === nextInputId) return;
    activePanel?.panel.update({ hoveredInputId: null });
    activePanel = nextPanel;
    activeInputId = nextInputId;
    activePanel?.panel.update({ hoveredInputId: activeInputId });
    canvas.style.cursor = activePanel ? "pointer" : "default";
    renderer.render(scene, camera);
  };
  const onPointerDown = (event: PointerEvent): void => {
    const hit = findHit(event);
    if (!hit) return;
    if (hit.inputId) {
      hit.panel.panel.update({ pressedInputId: hit.inputId });
      canvas.setPointerCapture(event.pointerId);
      renderer.render(scene, camera);
    } else {
      hit.panel.collapsed = !hit.panel.collapsed;
      hit.panel.panel.setCollapsed(hit.panel.collapsed);
      renderer.render(scene, camera);
    }
  };
  const onPointerUp = (): void => {
    for (const entry of panels) entry.panel.update({ pressedInputId: null });
    renderer.render(scene, camera);
  };
  const onClick = (event: PointerEvent): void => {
    const hit = findHit(event);
    if (!hit?.inputId) return;
    const inputId = hit.inputId;
    const entry = hit.panel;
    const item = entry.items.find((candidate) =>
      (candidate.kind === "toggle" || candidate.kind === "button") &&
      candidate.inputId === inputId);
    if (item?.kind === "toggle") {
      entry.toggles[inputId] = !entry.toggles[inputId];
    } else if (item?.kind === "button") {
      if (entry.selectedButtons.has(inputId)) entry.selectedButtons.delete(inputId);
      else entry.selectedButtons.add(inputId);
    }
    const updatedItems = entry.items.map((candidate) =>
      candidate.kind === "button" && candidate.inputId === inputId
        ? { ...candidate, text: entry.selectedButtons.has(inputId) ? "Selected" : candidate.text }
        : candidate);
    entry.panel.update({ items: updatedItems, toggles: { ...entry.toggles } });
    renderer.render(scene, camera);
  };
  const onPointerLeave = (): void => {
    activePanel?.panel.update({ hoveredInputId: null });
    activePanel = null;
    activeInputId = null;
    canvas.style.cursor = "default";
    renderer.render(scene, camera);
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("resize", resize);
  resize();

  return () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("resize", resize);
    panels.forEach(({ panel }) => panel.dispose());
    renderer.dispose();
    host.remove();
  };
}
