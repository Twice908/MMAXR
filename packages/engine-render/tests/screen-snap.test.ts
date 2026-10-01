import { describe, expect, it } from "vitest";
import {
  screenDropTolerancePx,
  screenPixelsToWorldUnits,
  selectProjectedSnapTarget,
  type ProjectedDropZone,
} from "../src/screen-snap.js";

const ring: ProjectedDropZone = {
  target: "shell:1",
  outline: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  slots: [
    { id: "slot:far", point: { x: 50, y: 0 } },
    { id: "slot:near", point: { x: 2, y: 0 } },
  ],
};

describe("projected screen snapping", () => {
  it("selects the nearest free slot on the nearest shell outline", () => {
    expect(selectProjectedSnapTarget({ x: 4, y: 5 }, [ring], 10)).toEqual({
      target: "shell:1",
      slotId: "slot:near",
      distancePx: 4,
    });
  });

  it("includes the tolerance edge and rejects a point just outside it", () => {
    expect(selectProjectedSnapTarget({ x: 50, y: -10 }, [ring], 10)?.target).toBe("shell:1");
    expect(selectProjectedSnapTarget({ x: 50, y: -10.01 }, [ring], 10)).toBeNull();
  });

  it("uses the nearest eligible shell and can target a full shell without a free slot", () => {
    const fullRing = { ...ring, target: "shell:2", slots: [], priority: 0 };
    const nearerRing = { ...ring, target: "shell:1", priority: 0 };
    expect(selectProjectedSnapTarget({ x: 50, y: -4 }, [fullRing, nearerRing], 8)?.target)
      .toBe("shell:1");
    expect(selectProjectedSnapTarget({ x: 50, y: -4 }, [fullRing], 8)).toMatchObject({
      target: "shell:2",
      slotId: null,
    });
  });

  it("provides a touch-sized band and a larger phone-screen band", () => {
    expect(screenDropTolerancePx("touch", 900)).toBeGreaterThanOrEqual(44);
    expect(screenDropTolerancePx("mouse", 390)).toBeGreaterThan(screenDropTolerancePx("mouse", 900));
  });

  it("scales world-space tolerance with camera depth and viewport size", () => {
    const near = screenPixelsToWorldUnits(44, 10, 42, 800);
    expect(screenPixelsToWorldUnits(44, 20, 42, 800)).toBeCloseTo(near * 2);
    expect(screenPixelsToWorldUnits(44, 10, 42, 400)).toBeCloseTo(near * 2);
  });

  it("returns the same near-ring target for mouse and touch input", () => {
    const pointer = { x: 50, y: -20 };
    const mouseTarget = selectProjectedSnapTarget(
      pointer,
      [ring],
      screenDropTolerancePx("mouse", 900),
    );
    const touchTarget = selectProjectedSnapTarget(
      pointer,
      [ring],
      screenDropTolerancePx("touch", 390),
    );
    expect(mouseTarget?.target).toBe("shell:1");
    expect(touchTarget?.target).toBe(mouseTarget?.target);
  });
});