import { describe, expect, it } from "vitest";
import { placeSpatialHint, type HintRect } from "../src/spatial-hints.js";

const viewport = { width: 390, height: 844 };
const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
const topControls: HintRect[] = [{ left: 250, right: 378, top: 8, bottom: 64 }];
const bottomControls: HintRect[] = [{ left: 0, right: 330, top: 700, bottom: 836 }];

describe("spatial direction hint safe zones", () => {
  it("keeps the full hint in the safe band and clear of control rectangles", () => {
    const position = placeSpatialHint(
      { x: 0.02, y: 0.02 },
      viewport,
      safeArea,
      topControls,
      bottomControls,
      [...topControls, ...bottomControls],
    );

    expect(position).not.toBeNull();
    expect(position!.x - 18).toBeGreaterThanOrEqual(36);
    expect(position!.x + 18).toBeLessThanOrEqual(viewport.width - 36);
    expect(position!.y - 18).toBeGreaterThanOrEqual(topControls[0]!.bottom + 8);
    expect(position!.y + 18).toBeLessThanOrEqual(bottomControls[0]!.top - 8);
    for (const rect of [...topControls, ...bottomControls]) {
      expect(position!.x + 18 <= rect.left
        || position!.x - 18 >= rect.right
        || position!.y + 18 <= rect.top
        || position!.y - 18 >= rect.bottom).toBe(true);
    }
  });

  it("suppresses a hint when controls leave no safe placement", () => {
    expect(placeSpatialHint(
      { x: 0.5, y: 0.5 },
      viewport,
      safeArea,
      [{ left: 0, right: 390, top: 0, bottom: 420 }],
      [{ left: 0, right: 390, top: 424, bottom: 844 }],
      [],
    )).toBeNull();
  });
});
