import { describe, expect, it } from "vitest";
import {
  glassPanelButtonState,
  hitTest,
  layoutPanel,
  layoutPanelPages,
  sameToggleValues,
} from "../src/visuals/panel-layout.js";
import { panelTextureDimensions } from "../src/visuals/glass-panel.js";

describe("glass panel layout", () => {
  it("keeps text at the minimum size and interactive regions at least 48px high", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "Heading", fontSizePx: 8 },
      { kind: "button", text: "Action", inputId: "action", fontSizePx: 8 },
      { kind: "toggle", text: "Option", inputId: "option" },
    ], { width: 320, height: 240 });

    expect(rects.map(({ fontSizePx }) => fontSizePx)).toEqual([20, 16, 16]);
    expect(rects.slice(1).every(({ height }) => height >= 48)).toBe(true);
  });

  it("paginates overflowing content without ellipsizing or shrinking targets", () => {
    const pages = layoutPanelPages([
      { kind: "heading", text: "Heading" },
      { kind: "button", text: "Action", inputId: "action" },
      { kind: "button", text: "Overflow", inputId: "overflow" },
    ], { width: 160, height: 140 });

    expect(pages.pages.length).toBeGreaterThan(1);
    expect(pages.pages.flat().some(({ inputId }) => inputId === "action")).toBe(true);
    expect(pages.pages.flat().filter(({ inputId }) => inputId === "action" || inputId === "overflow")
      .every(({ height }) => height >= 48)).toBe(true);
    expect(pages.pages.flatMap((page) => page.flatMap(({ lines }) => lines).join(" ")).join(" "))
      .not.toContain("…");
  });

  it("resolves default, hover, pressed, and disabled button states", () => {
    const button = { disabled: false };
    expect(glassPanelButtonState(button, false, false)).toBe("default");
    expect(glassPanelButtonState(button, true, false)).toBe("hover");
    expect(glassPanelButtonState(button, true, true)).toBe("pressed");
    expect(glassPanelButtonState({ disabled: true }, true, true)).toBe("disabled");
  });

  it("maps UV coordinates to interactive region IDs only", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "Heading" },
      { kind: "button", text: "Action", inputId: "action", regionId: "mission-action" },
    ], { width: 320, height: 180 });
    const button = rects[1]!;
    const uv = {
      x: (button.x + button.width / 2) / 320,
      y: 1 - (button.y + button.height / 2) / 180,
    };

    expect(hitTest(rects, uv)).toBe("mission-action");
    expect(hitTest(rects, { x: 0.01, y: 0.01 })).toBeNull();
  });

  it("lays out particle rows with colored labels and minimum-size secondary controls", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "Particles" },
      {
        kind: "text",
        text: "Proton 6",
        fontSizePx: 16,
        layoutGroup: "particle-row",
        markerColor: "rgb(214, 76, 53)",
        inputId: "particle:token:proton",
        regionId: "particle:token:proton",
        variant: "secondary",
        targetSizeDp: 48,
      },
      {
        kind: "button",
        text: "-",
        inputId: "particle:remove:proton",
        variant: "secondary",
        targetSizeDp: 48,
        layoutGroup: "particle-row",
      },
      {
        kind: "button",
        text: "+",
        inputId: "particle:add:proton",
        variant: "secondary",
        targetSizeDp: 48,
        layoutGroup: "particle-row",
      },
    ], { width: 360, height: 220 });
    const row = rects.slice(1);

    expect(row.map((rect) => rect.text)).toEqual(["Proton 6", "-", "+"]);
    expect(row[0]?.markerColor).toBe("rgb(214, 76, 53)");
    expect(row[0]?.height).toBeGreaterThanOrEqual(48);
    expect(row[0]?.variant).toBe("secondary");
    expect(hitTest(row, {
      x: (row[0]!.x + row[0]!.width / 2) / 360,
      y: 1 - (row[0]!.y + row[0]!.height / 2) / 220,
    })).toBe("particle:token:proton");
    expect(row.slice(1).every((rect) => rect.height >= 48)).toBe(true);
    expect(row.slice(1).every((rect) => rect.variant === "secondary")).toBe(true);
    expect(row.flatMap((rect) => rect.lines).join(" ")).not.toContain("…");
  });

  it("places all Element properties in two wrapped columns without ellipses", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "C" },
      { kind: "heading", text: "Carbon" },
      { kind: "text", text: "ELEMENT 06", fontSizePx: 16 },
      { kind: "text", text: "Atomic number Z 6", fontSizePx: 16, layoutGroup: "property-grid" },
      { kind: "text", text: "Mass number A 12", fontSizePx: 16, layoutGroup: "property-grid" },
      { kind: "text", text: "Charge 0", fontSizePx: 16, layoutGroup: "property-grid" },
      { kind: "text", text: "Electron configuration 2,4", fontSizePx: 16, layoutGroup: "property-grid" },
      { kind: "text", text: "Outer shell Incomplete", fontSizePx: 16, layoutGroup: "property-grid" },
      { kind: "text", text: "ATOM STATE", fontSizePx: 16, layoutGroup: "property-grid" },
    ], { width: 360, height: 360 });
    const properties = rects.filter((rect) =>
      rect.text !== "C" && rect.text !== "Carbon" && rect.text !== "ELEMENT 06",
    );

    expect(new Set(properties.slice(0, 2).map(({ x }) => x)).size).toBe(2);
    expect(properties.map(({ text }) => text)).toEqual([
      "Atomic number Z 6",
      "Mass number A 12",
      "Charge 0",
      "Electron configuration 2,4",
      "Outer shell Incomplete",
      "ATOM STATE",
    ]);
    expect(properties.flatMap(({ lines }) => lines).join(" ")).not.toContain("…");
    expect(properties.every(({ fontSizePx }) => fontSizePx >= 16)).toBe(true);
  });

  it("treats unchanged toggle values as a no-op drawing state", () => {
    expect(sameToggleValues({ mute: true, captions: false }, { mute: true, captions: false })).toBe(true);
    expect(sameToggleValues({ mute: true }, { mute: false })).toBe(false);
  });

  it("sizes collapsed panel textures to their displayed plane aspect", () => {
    const widthM = 0.28;
    const expandedHeightM = 0.38;
    const collapsedHeightM = 0.11;
    const texture = panelTextureDimensions(widthM, expandedHeightM, collapsedHeightM, true);
    const textureAspect = texture.width / texture.height;
    const displayedPlaneAspect = widthM / collapsedHeightM;

    expect(textureAspect).toBeCloseTo(displayedPlaneAspect, 2);
    expect(textureAspect).not.toBeCloseTo(widthM / expandedHeightM, 2);
  });
});
