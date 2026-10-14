import { spatialLayout } from "../spatial-layout.js";
import { spatialTokens, type SpatialTokens } from "../spatial-tokens.js";
import { horizonTokens } from "../horizon-tokens.js";

export interface GlassPanelSize {
  readonly width: number;
  readonly height: number;
}

export interface GlassPanelItemBase {
  readonly text: string;
  readonly fontSizePx?: number;
  readonly component?: "tooltip";
}

export interface GlassPanelHeading extends GlassPanelItemBase {
  readonly kind: "heading";
}

export interface GlassPanelText extends GlassPanelItemBase {
  readonly kind: "text";
  readonly layoutGroup?: "property-grid" | "particle-row";
  readonly markerColor?: string;
  readonly inputId?: string;
  readonly regionId?: string;
  readonly variant?: GlassPanelButton["variant"];
  readonly targetSizeDp?: number;
}

export interface GlassPanelButton extends GlassPanelItemBase {
  readonly kind: "button";
  readonly inputId: string;
  readonly regionId?: string;
  readonly variant?: "primary" | "secondary" | "borderless" | "destructive";
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly layoutGroup?: "mission-actions" | "particle-row";
  readonly textAlign?: "left" | "center";
  readonly targetSizeDp?: number;
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
  readonly lines: readonly string[];
  readonly lineHeightPx: number;
  readonly variant?: GlassPanelButton["variant"];
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly textAlign?: GlassPanelButton["textAlign"];
  readonly component?: GlassPanelItemBase["component"];
  readonly targetSizeDp?: number;
  readonly markerColor?: string;
}

export interface GlassPanelPages {
  readonly pages: readonly (readonly GlassPanelRect[])[];
}

export type GlassPanelButtonState = "default" | "hover" | "pressed" | "disabled";

/** Resolve the kit button state with disabled taking precedence over pointer state. */
export function glassPanelButtonState(
  button: Pick<GlassPanelButton, "disabled">,
  hovered: boolean,
  pressed: boolean,
): GlassPanelButtonState {
  if (button.disabled) return "disabled";
  if (pressed) return "pressed";
  if (hovered) return "hover";
  return "default";
}

/** Wrap text using measured canvas width without dropping words or adding ellipses. */
export function wrapPanelText(
  text: string,
  maxWidth: number,
  measureText: (text: string) => number,
): readonly string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (!line && measureText(word) > maxWidth) {
        let part = "";
        for (const character of word) {
          if (part && measureText(part + character) > maxWidth) {
            lines.push(part);
            part = character;
          } else {
            part += character;
          }
        }
        line = part;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

/** Lay out content into pages, preserving complete text and target sizes. */
export function layoutPanelPages(
  items: readonly GlassPanelItem[],
  size: GlassPanelSize,
  tokens: SpatialTokens = spatialTokens,
  measureText: (text: string, fontSizePx: number) => number =
    (text, fontSizePx) => text.length * fontSizePx * 0.55,
): GlassPanelPages {
  const pad = Number.parseFloat(tokens.padPanel);
  const gap = Number.parseFloat(tokens.gapControl);
  const width = Math.max(0, size.width - pad * 2);
  const navHeight = spatialLayout.minControlSizePx;
  const build = (footerHeight: number): GlassPanelRect[][] => {
    const pages: GlassPanelRect[][] = [[]];
    let y = pad;
    const pageLimit = size.height - pad - footerHeight;
    const page = (): GlassPanelRect[] => pages[pages.length - 1]!;
    const nextPage = (): void => {
      pages.push([]);
      y = pad;
    };
    const makeRect = (
      item: GlassPanelItem,
      x: number,
      rectWidth: number,
      rectHeight: number,
      lines: readonly string[],
      lineHeightPx: number,
    ): GlassPanelRect => ({
      x,
      y,
      width: rectWidth,
      height: rectHeight,
      canvasWidth: size.width,
      canvasHeight: size.height,
      kind: item.kind,
      text: item.text,
      lines,
      lineHeightPx,
      ...(item.component ? { component: item.component } : {}),
      ...("markerColor" in item && item.markerColor ? { markerColor: item.markerColor } : {}),
      fontSizePx: Math.max(minimumFontSize(item.kind), item.fontSizePx ?? defaultFontSize(item.kind)),
      ...("inputId" in item ? {
        inputId: item.inputId,
        regionId: item.regionId ?? item.inputId,
        ...(item.kind === "button" ? {
          ...(item.variant ? { variant: item.variant } : {}),
          ...(item.selected !== undefined ? { selected: item.selected } : {}),
          ...(item.disabled !== undefined ? { disabled: item.disabled } : {}),
          ...(item.textAlign ? { textAlign: item.textAlign } : {}),
          ...(item.targetSizeDp !== undefined ? { targetSizeDp: item.targetSizeDp } : {}),
        } : item.kind === "text" ? {
          ...(item.variant ? { variant: item.variant } : {}),
          ...(item.targetSizeDp !== undefined ? { targetSizeDp: item.targetSizeDp } : {}),
        } : {}),
      } : {}),
    });
    const appendText = (item: GlassPanelItem, rectWidth: number): void => {
      const fontSizePx = Math.max(minimumFontSize(item.kind), item.fontSizePx ?? defaultFontSize(item.kind));
      const lineHeightPx = item.kind === "heading"
        ? horizonTokens.typeScale.headline3.lineHeightDp
        : horizonTokens.typeScale.body1.lineHeightDp;
      const lines = wrapPanelText(item.text, rectWidth, (value) => measureText(value, fontSizePx));
      let offset = 0;
      while (offset < lines.length) {
        const available = pageLimit - y;
        const lineCount = Math.max(1, Math.floor((available + gap) / (lineHeightPx + gap)));
        if (lineCount === 1 && available < lineHeightPx && page().length > 0) {
          nextPage();
          continue;
        }
        const fragment = lines.slice(offset, offset + lineCount);
        const height = fragment.length * lineHeightPx;
        page().push(makeRect(item, pad, rectWidth, height, fragment, lineHeightPx));
        y += height + gap;
        offset += fragment.length;
        if (offset < lines.length) nextPage();
      }
    };

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      if (item.kind === "text" && item.layoutGroup === "property-grid") {
        const group: GlassPanelText[] = [];
        while (true) {
          const candidate = items[index];
          if (!candidate || candidate.kind !== "text" || candidate.layoutGroup !== "property-grid") break;
          group.push(candidate);
          index += 1;
        }
        index -= 1;
        const columnGap = Number.parseFloat(tokens.gapControl);
        const columnWidth = Math.max(0, (width - columnGap) / 2);
        for (let itemIndex = 0; itemIndex < group.length; itemIndex += 2) {
          const row = group.slice(itemIndex, itemIndex + 2);
          const linesByColumn = row.map((property) => wrapPanelText(
            property.text,
            columnWidth,
            (value) => measureText(value, Math.max(
              minimumFontSize("text"),
              property.fontSizePx ?? defaultFontSize("text"),
            )),
          ));
          const rowHeight = Math.max(
            ...linesByColumn.map((lines) => lines.length * horizonTokens.typeScale.body1.lineHeightDp),
          );
          if (y + rowHeight > pageLimit && page().length > 0) nextPage();
          row.forEach((property, column) => {
            page().push(makeRect(
              property,
              pad + column * (columnWidth + columnGap),
              columnWidth,
              rowHeight,
              linesByColumn[column]!,
              horizonTokens.typeScale.body1.lineHeightDp,
            ));
          });
          y += rowHeight + gap;
        }
        continue;
      }
      if (
        (item.kind === "text" && item.layoutGroup === "particle-row") ||
        (item.kind === "button" && item.layoutGroup === "particle-row")
      ) {
        const group: (GlassPanelText | GlassPanelButton)[] = [];
        while (true) {
          const candidate = items[index];
          if (candidate?.kind === "text" && candidate.layoutGroup === "particle-row") {
            group.push(candidate);
          } else if (candidate?.kind === "button" && candidate.layoutGroup === "particle-row") {
            group.push(candidate);
          } else {
            break;
          }
          index += 1;
        }
        index -= 1;
        const label = group[0];
        const remove = group[1];
        const add = group[2];
        if (
          group.length !== 3 ||
          label?.kind !== "text" ||
          !label.markerColor ||
          remove?.kind !== "button" ||
          add?.kind !== "button"
        ) {
          throw new Error("A particle row requires a colored label and two buttons.");
        }
        const buttonWidth = Math.max(
          remove.targetSizeDp ?? spatialLayout.minControlSizePx,
          add.targetSizeDp ?? spatialLayout.minControlSizePx,
        );
        const columnGap = Number.parseFloat(tokens.gapControl);
        const labelWidth = Math.max(0, width - buttonWidth * 2 - columnGap * 2);
        const fontSize = Math.max(minimumFontSize("text"), label.fontSizePx ?? defaultFontSize("text"));
        const lines = wrapPanelText(label.text, labelWidth - 24, (value) => measureText(value, fontSize));
        const rowHeight = Math.max(
          buttonWidth,
          label.targetSizeDp ?? spatialLayout.minControlSizePx,
          lines.length * horizonTokens.typeScale.body1.lineHeightDp,
        );
        if (y + rowHeight > pageLimit && page().length > 0) nextPage();
        page().push(makeRect(
          label,
          pad,
          labelWidth,
          rowHeight,
          lines,
          horizonTokens.typeScale.body1.lineHeightDp,
        ));
        page().push(makeRect(
          remove,
          pad + labelWidth + columnGap,
          buttonWidth,
          rowHeight,
          wrapPanelText(remove.text, buttonWidth, (value) =>
            measureText(value, Math.max(
              minimumFontSize("button"),
              remove.fontSizePx ?? defaultFontSize("button"),
            ))),
          horizonTokens.typeScale.body1.lineHeightDp,
        ));
        page().push(makeRect(
          add,
          pad + labelWidth + columnGap + buttonWidth + columnGap,
          buttonWidth,
          rowHeight,
          wrapPanelText(add.text, buttonWidth, (value) =>
            measureText(value, Math.max(
              minimumFontSize("button"),
              add.fontSizePx ?? defaultFontSize("button"),
            ))),
          horizonTokens.typeScale.body1.lineHeightDp,
        ));
        y += rowHeight + gap;
        continue;
      }
      if (item.kind !== "button" || item.layoutGroup !== "mission-actions") {
        const fontSizePx = Math.max(minimumFontSize(item.kind), item.fontSizePx ?? defaultFontSize(item.kind));
        const lineHeightPx = item.kind === "button"
          ? horizonTokens.typeScale.body1.lineHeightDp
          : item.kind === "heading"
            ? horizonTokens.typeScale.headline3.lineHeightDp
            : horizonTokens.typeScale.body1.lineHeightDp;
        const buttonWidth = item.kind === "button"
          ? Math.max(width, spatialLayout.minControlSizePx)
          : width;
        const lines = wrapPanelText(item.text, buttonWidth, (value) => measureText(value, fontSizePx));
        const height = item.kind === "button" || item.kind === "toggle"
          ? Math.max(
              item.kind === "button" ? item.targetSizeDp ?? spatialLayout.minControlSizePx : spatialLayout.minControlSizePx,
              lines.length * lineHeightPx,
            )
          : lines.length * lineHeightPx;
        if (y + height > pageLimit && page().length > 0) nextPage();
        if (height > pageLimit - y && item.kind !== "button") {
          appendText(item, width);
          continue;
        }
        page().push(makeRect(item, pad, buttonWidth, height, lines, lineHeightPx));
        y += height + gap;
        continue;
      }

      const group: GlassPanelButton[] = [];
      while (index < items.length) {
        const candidate = items[index];
        if (candidate?.kind !== "button" || candidate.layoutGroup !== "mission-actions") break;
        group.push(candidate);
        index += 1;
      }
      index -= 1;
      const gapWidth = Number.parseFloat(tokens.gapControl);
      const columnWidth = Math.max(spatialLayout.minControlSizePx, (width - gapWidth) / 2);
      for (let buttonIndex = 0; buttonIndex < group.length; buttonIndex += 2) {
        const row = group.slice(buttonIndex, buttonIndex + 2);
        const rowLines = row.map((button) => wrapPanelText(
          button.text,
          columnWidth,
          (value) => measureText(value, Math.max(spatialLayout.minTextSizePx, button.fontSizePx ?? defaultFontSize("button"))),
        ));
        const rowHeight = Math.max(
          ...row.map((button) => button.targetSizeDp ?? spatialLayout.minControlSizePx),
          ...rowLines.map((lines) => lines.length * horizonTokens.typeScale.body1.lineHeightDp),
        );
        if (y + rowHeight > pageLimit && page().length > 0) nextPage();
        row.forEach((button, column) => {
          const x = pad + column * (columnWidth + gapWidth);
          page().push(makeRect(
            button,
            x,
            columnWidth,
            rowHeight,
            rowLines[column]!,
            horizonTokens.typeScale.body1.lineHeightDp,
          ));
        });
        y += rowHeight + gap;
      }
    }
    return pages;
  };

  let pages = build(0);
  if (pages.length > 1) pages = build(navHeight);
  if (pages.length > 1) {
    pages.forEach((rects, index) => {
      const y = size.height - pad - navHeight;
      const arrowWidth = Math.min(navHeight, Math.max(0, (width - gap) / 2));
      rects.push({
        x: pad,
        y,
        width: arrowWidth,
        height: navHeight,
        canvasWidth: size.width,
        canvasHeight: size.height,
        kind: "button",
        text: "↑",
        lines: ["↑"],
        lineHeightPx: navHeight,
        fontSizePx: horizonTokens.typeScale.body1.sizeDp,
        inputId: "dock:detail:previous",
        regionId: "dock:detail:previous",
        variant: "borderless",
        disabled: index === 0,
        textAlign: "center",
      });
      rects.push({
        x: pad + width - arrowWidth,
        y,
        width: arrowWidth,
        height: navHeight,
        canvasWidth: size.width,
        canvasHeight: size.height,
        kind: "button",
        text: "↓",
        lines: ["↓"],
        lineHeightPx: navHeight,
        fontSizePx: horizonTokens.typeScale.body1.sizeDp,
        inputId: "dock:detail:next",
        regionId: "dock:detail:next",
        variant: "borderless",
        disabled: index === pages.length - 1,
        textAlign: "center",
      });
    });
  }
  return { pages };
}

/** Allocate the first panel page in top-left-origin canvas pixels. */
export function layoutPanel(
  items: readonly GlassPanelItem[],
  size: GlassPanelSize,
  tokens: SpatialTokens = spatialTokens,
): readonly GlassPanelRect[] {
  return layoutPanelPages(items, size, tokens).pages[0] ?? [];
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
    rect.disabled !== true &&
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
      return horizonTokens.typeScale.headline3.sizeDp;
    case "text":
    case "button":
    case "toggle":
      return minimumFontSize(kind);
  }
}

function minimumFontSize(kind: GlassPanelItem["kind"]): number {
  return kind === "heading"
    ? horizonTokens.typeScale.headline3.sizeDp
    : Math.max(horizonTokens.typeScale.body1.sizeDp, spatialLayout.minTextSizePx);
}
