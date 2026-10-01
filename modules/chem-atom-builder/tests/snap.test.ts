import { describe, expect, it } from "vitest";
import { chemistryReducer, createChemistryState } from "@mma/kit-chemistry";
import { screenDropTolerancePx } from "@mma/engine-render";
import { selectAtomDropTarget, selectAtomScreenDropTarget } from "../src/snap.js";

describe("atom snap target", () => {
  it("selects the nearest hit surface for a release", () => {
    expect(selectAtomDropTarget([
      { target: "shell:2", distance: 5 },
      { target: "nucleus", distance: 1 },
    ])).toBe("nucleus");
  });

  it("keeps an in-band full-shell drop subject to the existing chemistry rejection", () => {
    const target = selectAtomScreenDropTarget(
      { x: 50, y: -8 },
      [{
        target: "shell:1",
        outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
        slots: [],
      }],
      screenDropTolerancePx("touch", 390),
    );
    expect(target).toBe("shell:1");
    if (!target) {
      throw new Error("The tolerance band should select shell 1.");
    }

    const rejected = chemistryReducer(createChemistryState(2, 0, 2), {
      type: "particle/place",
      payload: { particle: "electron", target: "shell", shell: Number(target.split(":")[1]) },
    });
    expect(rejected.shells).toEqual([2]);
    expect(rejected.validationMessages).toEqual(["Shell 1 holds at most 2 electrons."]);
  });

  it("selects the same nearby shell for mouse and touch pointers", () => {
    const zones = [{
      target: "shell:2",
      outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      slots: [],
    }];
    const point = { x: 50, y: -20 };
    expect(selectAtomScreenDropTarget(point, zones, screenDropTolerancePx("mouse", 900)))
      .toBe("shell:2");
    expect(selectAtomScreenDropTarget(point, zones, screenDropTolerancePx("touch", 390)))
      .toBe("shell:2");
  });
});