import { spatialLayout } from "../spatial-layout.js";
import { spatialTokens, type SpatialTokens } from "../spatial-tokens.js";

export interface GlassPanelSize {
  readonly width: number;
  readonly height: number;
}

export interface GlassPanelItemBase {
  readonly text: string;
  readonly fontSizePx?: number;
}

export interface GlassPanelHeading extends GlassPanelItemBase {
  readonly kind: "heading";
}

export interface GlassPanelText extends GlassPanelItemBase {
  readonly kind: "text";
}

export interface GlassPanelButton extends GlassPanelItemBase {
  readonly kind: "button";
  readonly inputId: string;
  readonly regionId?: string;
}

export interface GlassPanelToggle extends GlassPanelItemBase {
  readonly kind: "toggle";
  readonly inputId: string;
  readonly regionId?: string;
}

export type GlassPanelItem =
  | GlassPanelHeading
  | GlassPanelText
  | GlassPanelButton
  | GlassPanelToggle;

export interface GlassPanelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly kind: GlassPanelItem["kind"];
  readonly text: string;
  readonly fontSizePx: number;
  readonly inputId?: string;
  readonly regionId?: string;
}

/** Allocate item rectangles in top-left-origin canvas pixels without GPU access. */
export function layoutPanel(
  items: readonly GlassPanelItem[],
  size: GlassPanelSize,
  tokens: SpatialTokens = spatialTokens,
): readonly GlassPanelRect[] {
  const pad = Number.parseFloat(tokens.padPanel);
  const gap = Number.parseFloat(tokens.gapControl);
  const minText = spatialLayout.minTextSizePx;
  let y = pad;
  const rects: GlassPanelRect[] = [];

  for (const item of items) {
    const fontSizePx = Math.max(minText, item.fontSizePx ?? defaultFontSize(item.kind));
    const height = item.kind === "button" || item.kind === "toggle"
      ? Math.max(
          spatialLayout.minControlSizePx,
          fontSizePx + Number.parseFloat(tokens.padControl.split(" ")[0]!) * 2,
        )
      : Math.max(fontSizePx * 1.45, item.kind === "heading" ? 30 : 26);
    if (y + height > size.height - pad) {
      break;
    }
    const interactive = item.kind === "button" || item.kind === "toggle";
    rects.push({
      x: pad,
      y,
      width: Math.max(0, size.width - pad * 2),
      height,
      canvasWidth: size.width,
      canvasHeight: size.height,
      kind: item.kind,
      text: item.text,
      fontSizePx,
      ...(interactive
        ? { inputId: item.inputId, regionId: item.regionId ?? item.inputId }
        : {}),
    });
    y += height + gap;
  }
  return rects;
}

/** Resolve a top-left-origin rectangle hit from a Three.js normalized UV. */
export function hitTest(
  rects: readonly GlassPanelRect[],
  uv: Readonly<{ x: number; y: number }>,
): string | null {
  const canvasWidth = rects[0]?.canvasWidth ?? 0;
  const canvasHeight = rects[0]?.canvasHeight ?? 0;
  const x = uv.x * canvasWidth;
  const y = (1 - uv.y) * canvasHeight;
  const hit = rects.find((rect) =>
    rect.regionId !== undefined &&
    x >= rect.x && x <= rect.x + rect.width &&
    y >= rect.y && y <= rect.y + rect.height);
  return hit?.regionId ?? null;
}

/** Return whether a settings-state update changes any toggle drawing state. */
export function sameToggleValues(
  first: Readonly<Record<string, boolean>>,
  second: Readonly<Record<string, boolean>>,
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return firstKeys.length === secondKeys.length &&
    firstKeys.every((key) => first[key] === second[key]);
}

function defaultFontSize(kind: GlassPanelItem["kind"]): number {
  switch (kind) {
    case "heading":
      return 24;
    case "text":
    case "button":
    case "toggle":
      return Math.max(18, spatialLayout.minTextSizePx);
  }
}
