import { describe, expect, it, vi } from "vitest";
import { InputEventBus } from "../src/event-bus.js";

describe("InputEventBus", () => {
  it("subscribes and emits typed events", () => {
    const bus = new InputEventBus();
    const listener = vi.fn();

    bus.on("sourceAdded", listener);
    bus.emit("sourceAdded", { source: "xr-hand", id: "hand-left" });

    expect(listener).toHaveBeenCalledWith({
      source: "xr-hand",
      id: "hand-left",
    });
  });

  it("returns an unsubscribe function", () => {
    const bus = new InputEventBus();
    const listener = vi.fn();

    const unsubscribe = bus.on("action", listener);
    unsubscribe();
    bus.emit("action", { type: "select", payload: { source: "mouse" } });

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners for the same event", () => {
    const bus = new InputEventBus();
    const a = vi.fn();
    const b = vi.fn();

    bus.on("gesture", a);
    bus.on("gesture", b);
    bus.emit("gesture", {
      type: "grab",
      source: "xr-hand",
      id: "hand-left",
      handedness: "left",
    });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("clear removes all listeners", () => {
    const bus = new InputEventBus();
    const listener = vi.fn();

    bus.on("sourceRemoved", listener);
    bus.clear();
    bus.emit("sourceRemoved", { source: "xr-controller", id: "controller-0" });

    expect(listener).not.toHaveBeenCalled();
  });
});
