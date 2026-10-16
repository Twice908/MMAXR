import * as THREE from "three";
import { horizonTokens } from "../horizon-tokens.js";
import { dpToMeters, xrTokens } from "../xr-tokens.js";
import { createGlassSurface, disposeGlassSurface } from "./glass-material.js";
import { createSpatialPanelHost } from "./spatial-panel-host.js";
import {
  createSpatialButton,
  createSpatialProgressBar,
  createSpatialPropertyRow,
  createSpatialStepper,
  createSpatialText,
  type SpatialPrimitive,
} from "./spatial-primitives.js";
import { createSpatialSlider } from "./spatial-slider.js";
import type { SpatialPointerTarget } from "./spatial-pointer.js";

/** Mount the existing development gallery with the shared token-driven primitives. */
export function mountGlassPanelGallery(root: HTMLElement): () => void {
  const host = document.createElement("div");
  host.className = "glass-gallery";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { display:block; width:100%; min-height:100vh; color:#272331; }
      * { box-sizing:border-box; }
      .page { min-height:100vh; padding:20px; font:16px/1.45 ${xrTokens.typography.fontFamily}; }
      h1 { margin:0 0 8px; font:700 24px/1.2 Georgia,"Times New Roman",serif; }
      p { margin:0 0 16px; }
      .stage { position:relative; height:min(78vh,760px); min-height:480px; overflow:hidden; border-radius:22px;
        background:linear-gradient(135deg,#fff 0%,#f7e5f2 42%,#272331 58%,#090910 100%); }
      canvas { position:absolute; inset:0; width:100%; height:100%; touch-action:none; }
      .hint { position:absolute; z-index:1; left:12px; bottom:12px; padding:6px 10px; border-radius:10px;
        background:rgba(255,255,255,.85); color:#272331; font-size:14px; pointer-events:none; }
    </style>
    <main class="page">
      <h1>Glass panels and shared primitives</h1>
      <p>Hover, press, and click the controls. The stepper clamps at both ends.</p>
      <section class="stage" aria-label="Glass panel scene">
        <canvas aria-label="Interactive glass panel scene"></canvas>
        <span class="hint">The gallery uses the shared panel hit-test and pointer-event path.</span>
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
  const group = new THREE.Group();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
  const panelWidthM = horizonTokens.panelSizeDp.default.width * horizonTokens.metresPerDp;
  const panelHeightM = horizonTokens.panelSizeDp.default.height * horizonTokens.metresPerDp;
  const backing = createGlassSurface("panel", { width: panelWidthM, height: panelHeightM });
  backing.position.z = -xrTokens.layers.panel.zOffsetM;
  group.add(backing);

  const primitives: SpatialPrimitive[] = [];
  const pointerTargets: SpatialPointerTarget[] = [];
  const addPrimitive = (primitive: SpatialPrimitive, x: number, y: number): void => {
    primitive.object3d.position.set(x, y, 0);
    group.add(primitive.object3d);
    primitives.push(primitive);
    pointerTargets.push(...primitive.pointerTargets);
  };

  let top = panelHeightM / 2 - dpToMeters(xrTokens.paddingDp.shell);
  for (const style of ["display", "title", "heading", "body", "label", "caption"] as const) {
    const sample = createSpatialText({ text: style, style });
    top -= dpToMeters(sample.heightDp) / 2;
    addPrimitive(
      sample,
      -panelWidthM / 2 + dpToMeters(xrTokens.paddingDp.shell + sample.widthDp / 2),
      top,
    );
    top -= dpToMeters(sample.heightDp / 2 + xrTokens.gapsDp.inline);
  }

  const buttons = [
    ["pill", "Pill"],
    ["control", "Control"],
    ["chip", "Chip"],
    ["circle", "1x"],
  ] as const;
  const buttonSamples = buttons.map(([variant, label]) => createSpatialButton({
    id: `gallery:${variant}`,
    label,
    variant,
    toggle: variant === "chip",
    selected: variant === "chip",
    primaryTarget: variant === "pill",
  }));
  const buttonGapM = dpToMeters(xrTokens.gapsDp.inline);
  const buttonsWidthM = buttonSamples.reduce((total, button) =>
    total + dpToMeters(button.widthDp), 0) + buttonGapM * (buttonSamples.length - 1);
  let buttonX = -buttonsWidthM / 2;
  const buttonY = 0;
  for (const button of buttonSamples) {
    const widthM = dpToMeters(button.widthDp);
    addPrimitive(button, buttonX + widthM / 2, buttonY);
    buttonX += widthM + buttonGapM;
  }

  const stepper = createSpatialStepper({
    id: "gallery:stepper",
    value: 1,
    min: 0,
    max: 3,
  });
  const progressWidthDp = xrTokens.sizesDp.targetPrimary * 4;
  const progress = createSpatialProgressBar({
    widthDp: progressWidthDp,
    heightDp: xrTokens.spacingDp[2]!,
    value: 1,
    max: 4,
  });
  const controlGapM = dpToMeters(xrTokens.gapsDp.panel);
  const controlRowWidthM = dpToMeters(stepper.widthDp + progress.widthDp) + controlGapM;
  addPrimitive(stepper, -controlRowWidthM / 2 + dpToMeters(stepper.widthDp) / 2, -top / 2);
  addPrimitive(progress, controlRowWidthM / 2 - dpToMeters(progress.widthDp) / 2, -top / 2);

  const positionSlider = createSpatialSlider({
    id: "gallery:position",
    label: "Position",
    orientation: "horizontal",
    min: xrTokens.panelLimits.distanceMeters.min,
    max: xrTokens.panelLimits.distanceMeters.max,
    value: xrTokens.panelLimits.distanceMeters.default,
  });
  addPrimitive(positionSlider, -dpToMeters(80), -panelHeightM * 0.28);
  const scaleSlider = createSpatialSlider({
    id: "gallery:scale",
    label: "Scale",
    orientation: "vertical",
    min: xrTokens.panelLimits.scale.min,
    max: xrTokens.panelLimits.scale.max,
    value: xrTokens.panelLimits.scale.default,
  });
  addPrimitive(scaleSlider, panelWidthM * 0.36, -panelHeightM * 0.03);

  const propertyRow = createSpatialPropertyRow({
    label: "Atomic number",
    value: "6",
    widthDp: xrTokens.sizesDp.sliderThumb.width * 4,
  });
  addPrimitive(propertyRow, 0, -panelHeightM / 2 + dpToMeters(xrTokens.paddingDp.shell));

  const panelHost = createSpatialPanelHost({
    group,
    camera,
    pointerTarget: canvas,
    panels: [],
    pointerTargets,
    onPanelAction: () => undefined,
    onPointerEvent: () => renderer.render(scene, camera),
  });

  let disposed = false;
  const resize = (): void => {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.position.z = Math.max(
      panelWidthM / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect),
      panelHeightM / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))),
    );
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  window.addEventListener("resize", resize);
  resize();

  return () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("resize", resize);
    panelHost.dispose();
    primitives.forEach((primitive) => primitive.dispose());
    disposeGlassSurface(backing);
    renderer.dispose();
    host.remove();
  };
}
