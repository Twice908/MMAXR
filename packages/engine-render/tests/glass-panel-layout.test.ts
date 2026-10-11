import { describe, expect, it } from "vitest";
import { hitTest, layoutPanel, sameToggleValues } from "../src/visuals/panel-layout.js";

describe("glass panel layout", () => {
  it("keeps text at the minimum size and interactive regions at least 44px high", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "Heading", fontSizePx: 8 },
      { kind: "button", text: "Action", inputId: "action", fontSizePx: 8 },
      { kind: "toggle", text: "Option", inputId: "option" },
    ], { width: 320, height: 240 });

    expect(rects.map(({ fontSizePx }) => fontSizePx)).toEqual([18, 18, 18]);
    expect(rects.slice(1).every(({ height }) => height >= 44)).toBe(true);
  });

  it("omits items that cannot fit rather than shrinking content", () => {
    const rects = layoutPanel([
      { kind: "heading", text: "Heading" },
      { kind: "button", text: "Action", inputId: "action" },
      { kind: "button", text: "Overflow", inputId: "overflow" },
    ], { width: 160, height: 140 });

    expect(rects.map(({ inputId }) => inputId)).toEqual([undefined, "action"]);
    expect(rects[1]?.height).toBeGreaterThanOrEqual(44);
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

  it("treats unchanged toggle values as a no-op drawing state", () => {
    expect(sameToggleValues({ mute: true, captions: false }, { mute: true, captions: false })).toBe(true);
    expect(sameToggleValues({ mute: true }, { mute: false })).toBe(false);
  });
});
