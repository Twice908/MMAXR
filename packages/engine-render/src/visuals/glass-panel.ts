import * as THREE from "three";
import { spatialLayout } from "../spatial-layout.js";
import { spatialTokens } from "../spatial-tokens.js";
import {
  hitTest,
  layoutPanel,
  sameToggleValues,
  type GlassPanelItem,
  type GlassPanelRect,
} from "./panel-layout.js";

const CANVAS_WIDTH = 1024;
const MAX_CANVAS_HEIGHT = 2048;
const MAX_PIXEL_RATIO = 1;

export interface GlassPanelState {
  readonly items?: readonly GlassPanelItem[];
  readonly hoveredInputId?: string | null;
  readonly pressedInputId?: string | null;
  readonly toggles?: Readonly<Record<string, boolean>>;
}

export interface CreateGlassPanelOptions {
  readonly id: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly surface: "uniform" | "framed";
  readonly title?: string;
  readonly items: readonly GlassPanelItem[];
  readonly collapsed?: boolean;
}

export interface GlassPanel {
  readonly object3d: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  update(itemsOrState: readonly GlassPanelItem[] | GlassPanelState): void;
  hitTest(uv: Readonly<{ x: number; y: number }>): string | null;
  setCollapsed(collapsed: boolean): void;
  setScale(scale: number): void;
  dispose(): void;
}

/** Build a view-only textured glass panel; it has no store or input listeners. */
export function createGlassPanel(options: CreateGlassPanelOptions): GlassPanel {
  if (!(options.widthM > 0) || !(options.heightM > 0)) {
    throw new RangeError("Glass panel dimensions must be positive.");
  }

  const aspect = options.heightM / options.widthM;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, 1);
  const canvasWidth = Math.round(CANVAS_WIDTH * pixelRatio);
  const canvasHeight = Math.min(MAX_CANVAS_HEIGHT, Math.max(1, Math.round(canvasWidth * aspect)));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("A 2D canvas context is required to draw a glass panel.");
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(options.widthM, options.heightM);
  const object3d = new THREE.Mesh(geometry, material);
  object3d.name = options.id;
  object3d.userData.inputId = options.id;

  let items = options.items;
  let collapsed = options.collapsed ?? false;
  let hoveredInputId: string | null = null;
  let pressedInputId: string | null = null;
  let toggles: Readonly<Record<string, boolean>> = {};
  let rects: readonly GlassPanelRect[] = [];
  let dirty = true;
  let disposed = false;
  let uniformScale = 1;
  const expandedHeight = options.heightM;
  const compactHeight = Math.min(expandedHeight, spatialLayout.particles.collapsedSize.height);
  const disposeResources = (): void => {
    if (disposed) return;
    disposed = true;
    texture.dispose();
    material.dispose();
    geometry.dispose();
  };

  const compactItems = (): readonly GlassPanelItem[] => {
    const activeItems = displayItems();
    const titleText = options.title ?? activeItems.find((item) => item.kind === "heading")?.text ?? "";
    const summaryText = activeItems.find((item) => item.kind === "text")?.text
      ?? activeItems.find((item) => item.kind !== "heading")?.text
      ?? "";
    return [
      { kind: "heading", text: titleText },
      ...(summaryText ? [{ kind: "text" as const, text: summaryText }] : []),
    ];
  };

  const draw = (): void => {
    if (!dirty || disposed) return;
    dirty = false;
    const activeHeightM = collapsed ? compactHeight : expandedHeight;
    const height = Math.min(
      MAX_CANVAS_HEIGHT,
      Math.max(1, Math.round(canvasWidth * activeHeightM / options.widthM)),
    );
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const drawnItems = collapsed ? compactItems() : displayItems();
    rects = layoutPanel(drawnItems, { width: canvas.width, height: canvas.height });
    drawSurface(context, canvas.width, canvas.height, options.surface);
    drawItems(context, rects, toggles, hoveredInputId, pressedInputId);
    texture.needsUpdate = true;
  };

  const setCollapsed = (next: boolean): void => {
    if (collapsed === next) return;
    collapsed = next;
    object3d.scale.set(
      uniformScale,
      uniformScale * (next ? compactHeight / expandedHeight : 1),
      uniformScale,
    );
    dirty = true;
    try {
      draw();
    } catch (error) {
      disposeResources();
      throw error;
    }
  };

  const displayItems = (): readonly GlassPanelItem[] =>
    options.title && !items.some((item) => item.kind === "heading")
      ? [{ kind: "heading", text: options.title }, ...items]
      : items;

  const update = (itemsOrState: readonly GlassPanelItem[] | GlassPanelState): void => {
    if (disposed) return;
    if (isItems(itemsOrState)) {
      if (sameItems(items, itemsOrState)) return;
      items = itemsOrState;
    } else {
      let changed = false;
      if (itemsOrState.items && !sameItems(items, itemsOrState.items)) {
        items = itemsOrState.items;
        changed = true;
      }
      if (itemsOrState.hoveredInputId !== undefined && hoveredInputId !== itemsOrState.hoveredInputId) {
        hoveredInputId = itemsOrState.hoveredInputId;
        changed = true;
      }
      if (itemsOrState.pressedInputId !== undefined && pressedInputId !== itemsOrState.pressedInputId) {
        pressedInputId = itemsOrState.pressedInputId;
        changed = true;
      }
      if (itemsOrState.toggles && !sameToggleValues(toggles, itemsOrState.toggles)) {
        toggles = itemsOrState.toggles;
        changed = true;
      }
      if (!changed) return;
    }
    dirty = true;
    try {
      draw();
    } catch (error) {
      disposeResources();
      throw error;
    }
  };

  draw();
  object3d.scale.set(
    uniformScale,
    uniformScale * (collapsed ? compactHeight / expandedHeight : 1),
    uniformScale,
  );

  return {
    object3d,
    update,
    hitTest: (uv) => {
      draw();
      return hitTest(rects, uv);
    },
    setCollapsed,
    setScale(scale) {
      if (!Number.isFinite(scale) || scale <= 0) {
        throw new RangeError("Glass panel scale must be positive.");
      }
      uniformScale = scale;
      object3d.scale.set(
        scale,
        scale * (collapsed ? compactHeight / expandedHeight : 1),
        scale,
      );
    },
    dispose: () => {
      disposeResources();
      object3d.removeFromParent();
    },
  };
}

function isItems(
  value: readonly GlassPanelItem[] | GlassPanelState,
): value is readonly GlassPanelItem[] {
  return Array.isArray(value);
}

function sameItems(
  first: readonly GlassPanelItem[],
  second: readonly GlassPanelItem[],
): boolean {
  return first.length === second.length && first.every((item, index) => {
    const next = second[index];
    return next !== undefined &&
      item.kind === next.kind &&
      item.text === next.text &&
      item.fontSizePx === next.fontSizePx &&
      ("inputId" in item ? item.inputId : undefined) === ("inputId" in next ? next.inputId : undefined) &&
      ("regionId" in item ? item.regionId : undefined) === ("regionId" in next ? next.regionId : undefined);
  });
}

function drawSurface(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  surface: "uniform" | "framed",
): void {
  context.save();
  context.shadowColor = "rgba(102, 81, 118, 0.094)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 20;
  roundedRect(context, 1, 1, width - 2, height - 2, parseFloat(spatialTokens.radiusPanel));
  context.fillStyle = surface === "framed" ? "rgba(255, 255, 255, 0.48)" : spatialTokens.surface;
  context.fill();
  context.restore();

  if (surface === "framed") {
    const inset = Math.max(8, parseFloat(spatialTokens.padControl));
    roundedRect(
      context,
      inset,
      inset,
      width - inset * 2,
      height - inset * 2,
      parseFloat(spatialTokens.radiusPanel) - 6,
    );
    context.fillStyle = spatialTokens.surface;
    context.fill();
  }

  roundedRect(context, 1, 1, width - 2, height - 2, parseFloat(spatialTokens.radiusPanel));
  context.strokeStyle = spatialTokens.edge;
  context.lineWidth = parseFloat(spatialTokens.edgeWidth);
  context.stroke();
  context.beginPath();
  context.moveTo(24, 2);
  context.lineTo(width - 24, 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.85)";
  context.lineWidth = 1;
  context.stroke();
  roundedRect(context, 3, 3, width - 6, height - 6, parseFloat(spatialTokens.radiusPanel) - 2);
  context.strokeStyle = "rgba(180, 203, 169, 0.45)";
  context.shadowColor = spatialTokens.accentGreen;
  context.shadowBlur = 24;
  context.stroke();
}

function drawItems(
  context: CanvasRenderingContext2D,
  rects: readonly GlassPanelRect[],
  toggles: Readonly<Record<string, boolean>>,
  hoveredInputId: string | null,
  pressedInputId: string | null,
): void {
  for (const rect of rects) {
    const isInteractive = rect.inputId !== undefined;
    const isPressed = rect.inputId === pressedInputId;
    const isHovered = rect.inputId === hoveredInputId;
    if (rect.kind === "button" || rect.kind === "toggle") {
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      const checked = rect.kind === "toggle" && toggles[rect.inputId!] === true;
      context.fillStyle = checked
        ? "rgba(32, 185, 119, 0.2)"
        : isPressed
          ? "rgba(32, 185, 119, 0.32)"
          : isHovered
            ? "rgba(32, 185, 119, 0.14)"
            : "rgba(255, 255, 255, 0.72)";
      context.fill();
      context.strokeStyle = checked || isHovered ? spatialTokens.accentGreen : spatialTokens.edge;
      context.lineWidth = 1;
      context.stroke();
    }

    context.font = `${rect.kind === "heading" ? 700 : 500} ${rect.fontSizePx}px ${rect.kind === "heading"
      ? 'Georgia, "Times New Roman", serif'
      : '"Avenir Next", "Trebuchet MS", sans-serif'}`;
    context.letterSpacing = rect.kind === "heading" ? spatialTokens.headingLetterSpacing : "0px";
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.fillStyle = isInteractive ? spatialTokens.ink : rect.kind === "text" ? spatialTokens.inkMuted : spatialTokens.ink;
    const textX = rect.x + (rect.kind === "button" || rect.kind === "toggle" ? 12 : 0);
    const textY = rect.kind === "button" || rect.kind === "toggle"
      ? rect.y + rect.height / 2
      : rect.y + rect.height / 2;
    const available = rect.width - (rect.kind === "toggle" ? 64 : (isInteractive ? 24 : 0));
    if (rect.kind === "toggle") {
      context.fillStyle = toggles[rect.inputId!] ? spatialTokens.accentGreen : spatialTokens.inkMuted;
      context.fillText(toggles[rect.inputId!] ? "On" : "Off", rect.x + rect.width - 52, textY);
    }
    context.fillText(ellipsize(context, rect.text, available), textX, textY, available);
  }
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 0 && context.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}
