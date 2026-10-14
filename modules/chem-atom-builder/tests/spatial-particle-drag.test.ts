import { describe, expect, it } from "vitest";
import type { InputAction } from "@mma/engine-render";
import {
  blocksViewInputDuringParticleDrag,
  createSpatialParticleDragHandler,
} from "../src/spatial-particle-drag.js";

const rayPayload = {
  rayOriginX: 1,
  rayOriginY: 2,
  rayOriginZ: 3,
  rayDirectionX: 0,
  rayDirectionY: 0,
  rayDirectionZ: -1,
};

function dragAction(
  type: "grab" | "move" | "release",
  source = "tray:proton",
  extras: Readonly<Record<string, string | number | boolean>> = {},
): InputAction {
  return {
    type,
    payload: { source, spatialParticleDrag: true, ...rayPayload, ...extras },
  };
}

describe("spatial particle drag", () => {
  it("starts on a particle token and adds exactly once when dropped on the atom", () => {
    const actions: string[] = [];
    let target: string | null = null;
    const drag = createSpatialParticleDragHandler({
      begin: (particle) => actions.push(`begin:${particle}`),
      move: () => target,
      runCommand: (command) => actions.push(command),
      end: () => actions.push("end"),
    });

    expect(drag.handle(dragAction("grab"))).toBe(true);
    expect(drag.isActive()).toBe(true);
    expect(blocksViewInputDuringParticleDrag("rotate", drag.isActive())).toBe(true);
    expect(blocksViewInputDuringParticleDrag("move", drag.isActive())).toBe(true);
    expect(blocksViewInputDuringParticleDrag("scale", drag.isActive())).toBe(true);
    drag.handle(dragAction("move"));
    target = "nucleus";
    drag.handle(dragAction("release"));

    expect(actions).toEqual(["begin:proton", "particle:add:proton", "end"]);
    expect(drag.isActive()).toBe(false);
  });

  it("cancels drops outside the atom and clears the active drag", () => {
    const actions: string[] = [];
    const drag = createSpatialParticleDragHandler({
      begin: (particle) => actions.push(`begin:${particle}`),
      move: () => null,
      runCommand: (command) => actions.push(command),
      end: () => actions.push("end"),
    });

    drag.handle(dragAction("grab", "tray:neutron"));
    drag.handle(dragAction("release", "tray:neutron"));
    drag.handle(dragAction("grab", "tray:electron"));
    drag.handle(dragAction("release", "tray:electron", { cancelled: true }));

    expect(actions).toEqual([
      "begin:neutron",
      "end",
      "begin:electron",
      "end",
    ]);
    expect(drag.isActive()).toBe(false);
  });
});
