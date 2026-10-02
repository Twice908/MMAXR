import { describe, expect, it } from "vitest";
import { mapXrPointerSample, type XrPointerGesture, type XrPointerSample } from "../src/input-mapping.js";

const point = { x: 1, y: 2, z: -3 };

function sample(overrides: Partial<XrPointerSample>): XrPointerSample {
  return {
    phase: "move",
    pointerId: 4,
    target: null,
    targetKind: null,
    position: point,
    ...overrides,
  };
}

describe("XR pointer input mapping", () => {
  it("maps selectable and grabbable pointer-down events", () => {
    expect(mapXrPointerSample(sample({
      phase: "down",
      target: "shell:2",
      targetKind: "selectable",
    }), null)).toEqual({
      actions: [{ type: "select", payload: { target: "shell:2" } }],
      gesture: null,
    });

    expect(mapXrPointerSample(sample({
      phase: "down",
      target: "tray:proton",
      targetKind: "grabbable",
    }), null)).toEqual({
      actions: [{ type: "grab", payload: { source: "tray:proton", pointerId: 4 } }],
      gesture: { pointerId: 4, source: "tray:proton", position: point },
    });
  });

  it("maps idle movement to hover and an active drag to move", () => {
    expect(mapXrPointerSample(sample({ target: "nucleus" }), null).actions).toEqual([
      { type: "hover", payload: { target: "nucleus" } },
    ]);

    const gesture: XrPointerGesture = { pointerId: 4, source: "tray:proton", position: null };
    expect(mapXrPointerSample(sample({ position: point }), gesture)).toEqual({
      actions: [{ type: "move", payload: { source: "tray:proton", position: point } }],
      gesture: { ...gesture, position: point },
    });
  });

  it("maps release and cancellation to release actions", () => {
    const gesture: XrPointerGesture = { pointerId: 4, source: "tray:proton", position: point };
    expect(mapXrPointerSample(sample({ phase: "up", target: "nucleus" }), gesture)).toEqual({
      actions: [{ type: "release", payload: { source: "tray:proton", target: "nucleus" } }],
      gesture: null,
    });
    expect(mapXrPointerSample(sample({ phase: "cancel" }), gesture).actions).toEqual([
      { type: "release", payload: { source: "tray:proton", target: null } },
    ]);
  });

  it("does not let another pointer mutate the active gesture", () => {
    const gesture: XrPointerGesture = { pointerId: 4, source: "tray:proton", position: point };
    const result = mapXrPointerSample(sample({ pointerId: 5, target: "nucleus" }), gesture);

    expect(result.actions).toEqual([{ type: "hover", payload: { target: "nucleus" } }]);
    expect(result.gesture).toBe(gesture);
  });
});