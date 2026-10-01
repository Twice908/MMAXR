import { describe, expect, it } from "vitest";
import { mapBack, mapConfirmCommand, mapPointerSample, mapScaleDelta } from "../src/input-mapping.js";

describe("screen input mapping", () => {
  it("maps a tray drag through grab, move, and release", () => {
    const down = mapPointerSample({
      phase: "down",
      pointerId: 7,
      x: 10,
      y: 12,
      target: "tray:proton",
    }, null);
    const move = mapPointerSample({
      phase: "move",
      pointerId: 7,
      x: 30,
      y: 40,
      target: null,
    }, down.gesture);
    const up = mapPointerSample({
      phase: "up",
      pointerId: 7,
      x: 30,
      y: 40,
      target: "nucleus",
    }, move.gesture);

    expect(down.actions[0]?.type).toBe("grab");
    expect(move.actions[0]?.type).toBe("move");
    expect(up.actions).toEqual([{
      type: "release",
      payload: { source: "tray:proton", target: "nucleus" },
    }]);
    expect(up.gesture).toBeNull();
  });

  it("maps background drags and wheel gestures to camera actions", () => {
    const down = mapPointerSample({
      phase: "down",
      pointerId: 1,
      x: 0,
      y: 0,
      target: null,
    }, null);
    const move = mapPointerSample({
      phase: "move",
      pointerId: 1,
      x: 12,
      y: -4,
      target: null,
    }, down.gesture);

    expect(move.actions[0]).toEqual({
      type: "rotate",
      payload: { deltaX: 12, deltaY: -4 },
    });
    expect(mapScaleDelta(-1)).toEqual({ type: "scale", payload: { delta: -1 } });
  });

  it("maps controls to confirm actions", () => {
    expect(mapConfirmCommand("atom/reset")).toEqual({
      type: "confirm",
      payload: { command: "atom/reset" },
    });
  });

  it("maps scene selection, idle hover, and back navigation", () => {
    const selected = mapPointerSample({
      phase: "down",
      pointerId: 3,
      x: 5,
      y: 8,
      target: "shell:2",
    }, null);
    const hovered = mapPointerSample({
      phase: "move",
      pointerId: 3,
      x: 7,
      y: 9,
      target: "nucleus",
    }, null);

    expect(selected.actions[0]?.type).toBe("select");
    expect(hovered.actions[0]).toEqual({ type: "hover", payload: { target: "nucleus" } });
    expect(mapBack()).toEqual({ type: "back", payload: null });
  });
});