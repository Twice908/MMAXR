import { describe, expect, it, vi } from "vitest";
import { ActionDispatcher } from "../src/action-dispatcher.js";
import { InputEventBus } from "../src/event-bus.js";

describe("ActionDispatcher", () => {
  it("dispatches the exact action to the application", () => {
    const dispatch = vi.fn();
    const bus = new InputEventBus();
    const dispatcher = new ActionDispatcher(dispatch, bus);
    const action = {
      type: "grab",
      payload: { source: "xr-hand", target: "electron:1" },
    } as const;

    dispatcher.emit(action);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(action);
  });

  it("also emits the action on the shared event bus", () => {
    const dispatch = vi.fn();
    const bus = new InputEventBus();
    const listener = vi.fn();

    bus.on("action", listener);
    new ActionDispatcher(dispatch, bus).emit({
      type: "scale",
      payload: { scale: 1.2 },
    });

    expect(listener).toHaveBeenCalledWith({
      type: "scale",
      payload: { scale: 1.2 },
    });
  });
});
