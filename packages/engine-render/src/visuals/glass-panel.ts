import * as THREE from "three";
import { spatialLayout } from "../spatial-layout.js";
import { spatialTokens } from "../spatial-tokens.js";
import { xrTokens } from "../xr-tokens.js";
import {
  hitTest,
  glassPanelButtonState,
  layoutPanelPages,
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
  readonly component?: "button" | "card" | "panel";
  readonly surfaceComponent?: "panel";
  readonly widthM: number;
  readonly heightM: number;
  readonly pixelWidth?: number;
  /** Canvas padding for dense compact cards or full-surface controls. */
  readonly contentPaddingPx?: number;
  readonly collapsedHeightM?: number;
  readonly surface: "uniform" | "framed";
  readonly title?: string;
  readonly compactTitle?: string;
  readonly items: readonly GlassPanelItem[];
  readonly collapsed?: boolean;
}

export interface GlassPanel {
  readonly object3d: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  update(itemsOrState: readonly GlassPanelItem[] | GlassPanelState): void;
  hitTest(uv: Readonly<{ x: number; y: number }>): string | null;
  setCollapsed(collapsed: boolean): void;
  setPage(page: number): void;
  setScale(scale: number): void;
  dispose(): void;
}

/** Return texture dimensions for the plane's currently displayed aspect ratio. */
export function panelTextureDimensions(
  widthM: number,
  expandedHeightM: number,
  collapsedHeightM: number,
  collapsed: boolean,
  pixelWidth = CANVAS_WIDTH,
): Readonly<{ width: number; height: number }> {
  const width = Math.round(THREE.MathUtils.clamp(pixelWidth, 64, CANVAS_WIDTH));
  const displayedHeight = collapsed ? collapsedHeightM : expandedHeightM;
  return {
    width,
    height: Math.min(MAX_CANVAS_HEIGHT, Math.max(1, Math.round(width * displayedHeight / widthM))),
  };
}

/** Build a view-only textured glass panel; it has no store or input listeners. */
export function createGlassPanel(options: CreateGlassPanelOptions): GlassPanel {
  if (!(options.widthM > 0) || !(options.heightM > 0)) {
    throw new RangeError("Glass panel dimensions must be positive.");
  }

  const aspect = options.heightM / options.widthM;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, 1);
  const canvasWidth = Math.round(
    THREE.MathUtils.clamp(options.pixelWidth ?? CANVAS_WIDTH, 64, CANVAS_WIDTH) * pixelRatio,
  );
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
  object3d.userData.horizonComponents = [
    ...(options.surfaceComponent ? [options.surfaceComponent] : []),
    options.component ?? "panel",
  ];

  let items = options.items;
  let collapsed = options.collapsed ?? false;
  let hoveredInputId: string | null = null;
  let pressedInputId: string | null = null;
  let toggles: Readonly<Record<string, boolean>> = {};
  let pageIndex = 0;
  let rects: readonly GlassPanelRect[] = [];
  let dirty = true;
  let disposed = false;
  let uniformScale = 1;
  const expandedHeight = options.heightM;
  const compactHeight = Math.min(
    expandedHeight,
    options.collapsedHeightM ?? 0.11,
  );
  const disposeResources = (): void => {
    if (disposed) return;
    disposed = true;
    texture.dispose();
    material.dispose();
    geometry.dispose();
  };

  const compactItems = (heightPx: number): readonly GlassPanelItem[] => {
    const activeItems = displayItems();
    const titleText = options.compactTitle ??
      options.title ??
      activeItems.find((item) => item.kind === "heading")?.text ??
      "";
    const summaryText = activeItems.find((item) => item.kind === "text")?.text
      ?? activeItems.find((item) => item.kind !== "heading")?.text
      ?? "";
    const compactFontSize = Math.max(
      spatialLayout.minTextSizePx,
      Math.floor(heightPx * 0.25),
    );
    return [
      { kind: "heading", text: titleText, fontSizePx: compactFontSize },
      ...(summaryText
        ? [{ kind: "text" as const, text: summaryText, fontSizePx: compactFontSize }]
        : []),
    ];
  };

  const draw = (): void => {
    if (!dirty || disposed) return;
    dirty = false;
    const height = panelTextureDimensions(
      options.widthM,
      expandedHeight,
      compactHeight,
      collapsed,
      canvasWidth,
    ).height;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const drawnItems = collapsed ? compactItems(canvas.height) : displayItems();
    const panelTokens = options.contentPaddingPx === undefined
      ? spatialTokens
      : { ...spatialTokens, padPanel: `${options.contentPaddingPx}px` };
    const compactTokens = {
      ...panelTokens,
      padPanel: `${Math.min(options.contentPaddingPx ?? 6, 6)}px`,
      gapControl: "3px",
    };
    context.font = `${xrTokens.typography.minimumSizeDp}px ${xrTokens.typography.fontFamily}`;
    const pages = layoutPanelPages(
      drawnItems,
      { width: canvas.width, height: canvas.height },
      collapsed ? compactTokens : panelTokens,
      (text, fontSizePx) => {
        context.font = `${fontSizePx}px ${xrTokens.typography.fontFamily}`;
        return context.measureText(text).width;
      },
    ).pages;
    pageIndex = Math.min(pageIndex, pages.length - 1);
    rects = pages[pageIndex] ?? [];
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
      pageIndex = 0;
    } else {
      let changed = false;
      if (itemsOrState.items && !sameItems(items, itemsOrState.items)) {
        items = itemsOrState.items;
        pageIndex = 0;
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
    setPage(page) {
      if (!Number.isInteger(page) || page < 0) return;
      pageIndex = page;
      dirty = true;
      draw();
    },
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
      ("variant" in item ? item.variant : undefined) === ("variant" in next ? next.variant : undefined) &&
      ("selected" in item ? item.selected : undefined) === ("selected" in next ? next.selected : undefined) &&
      ("disabled" in item ? item.disabled : undefined) === ("disabled" in next ? next.disabled : undefined) &&
      ("layoutGroup" in item ? item.layoutGroup : undefined) === ("layoutGroup" in next ? next.layoutGroup : undefined) &&
      ("markerColor" in item ? item.markerColor : undefined) === ("markerColor" in next ? next.markerColor : undefined) &&
      ("textAlign" in item ? item.textAlign : undefined) === ("textAlign" in next ? next.textAlign : undefined) &&
      item.component === next.component &&
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
    const state = rect.inputId === undefined
      ? "default"
      : glassPanelButtonState(rect, isHovered, isPressed);
    context.globalAlpha = state === "disabled" ? 0.45 : 1;
    if (rect.kind === "button" || rect.kind === "toggle") {
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      const checked = rect.kind === "toggle" && toggles[rect.inputId!] === true;
      context.fillStyle = rect.variant === "borderless"
        ? "rgba(255, 255, 255, 0)"
        : state === "pressed"
          ? "rgba(32, 185, 119, 0.32)"
          : state === "hover"
            ? "rgba(32, 185, 119, 0.14)"
            : rect.selected || rect.variant === "primary" || checked
              ? "rgba(32, 185, 119, 0.2)"
              : "rgba(255, 255, 255, 0.72)";
      context.fill();
      if (rect.variant !== "borderless" || isHovered || isPressed) {
        context.strokeStyle = rect.selected || checked || isHovered ? spatialTokens.accentGreen : spatialTokens.edge;
        context.lineWidth = 1;
        context.stroke();
      }
    }
    if (rect.kind === "text" && isInteractive) {
      roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
      context.fillStyle = state === "pressed"
        ? "rgba(32, 185, 119, 0.32)"
        : state === "hover"
          ? "rgba(32, 185, 119, 0.14)"
          : "rgba(255, 255, 255, 0.72)";
      context.fill();
      context.strokeStyle = state === "default" ? spatialTokens.edge : spatialTokens.accentGreen;
      context.lineWidth = 1;
      context.stroke();
    }

    context.font = `${rect.selected || rect.kind === "heading" ? "bold" : "normal"} ${rect.fontSizePx}px ${xrTokens.typography.fontFamily}`;
    context.letterSpacing = "0px";
    context.textBaseline = "middle";
    context.textAlign = rect.textAlign === "center" ? "center" : "left";
    context.fillStyle = isInteractive ? spatialTokens.ink : rect.kind === "text" ? spatialTokens.inkMuted : spatialTokens.ink;
    if (rect.markerColor) {
      context.beginPath();
      context.arc(rect.x + 8, rect.y + rect.height / 2, 5, 0, Math.PI * 2);
      context.fillStyle = rect.markerColor;
      context.fill();
      context.fillStyle = isInteractive ? spatialTokens.ink : spatialTokens.inkMuted;
    }
    const textX = rect.textAlign === "center"
      ? rect.x + rect.width / 2
      : rect.x + (rect.kind === "button" || rect.kind === "toggle" ? 12 : rect.markerColor ? 20 : 0);
    const textY = rect.y + (rect.height - rect.lines.length * rect.lineHeightPx) / 2 +
      rect.lineHeightPx / 2;
    if (rect.kind === "toggle") {
      context.fillStyle = toggles[rect.inputId!] ? spatialTokens.accentGreen : spatialTokens.inkMuted;
      context.fillText(toggles[rect.inputId!] ? "On" : "Off", rect.x + rect.width - 52, textY);
    }
    rect.lines.forEach((line, index) =>
      context.fillText(line, textX, textY + index * rect.lineHeightPx));
    context.globalAlpha = 1;
  }
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
