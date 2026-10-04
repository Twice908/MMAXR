import { describe, expect, it, vi } from "vitest";
import { MouseInputAdapter } from "../src/mouse.js";
import { InputEventBus } from "../src/event-bus.js";
import { FakeDomElement, event } from "./helpers/fake-dom.js";
import { createActionSink } from "./helpers/test-actions.js";

describe("MouseInputAdapter", () => {
  function create() {
    const root = new FakeDomElement();
    const sink = createActionSink();
    const adapter = new MouseInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => "atom:1",
    });
    return { root, sink, adapter };
  }

  it("selects the picked object on left click", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 100,
      clientY: 100,
    }));

    expect(sink.actions).toEqual([
      {
        type: "select",
        payload: {
          source: "mouse",
          target: "atom:1",
          x: 100,
          y: 100,
        },
      },
    ]);

    adapter.dispose();
  });

  it("emits move while dragging", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 100,
      clientY: 100,
    }));
    root.dispatchEvent(event("mousemove", {
      clientX: 120,
      clientY: 130,
    }));

    expect(sink.actions[1]).toMatchObject({
      type: "move",
      payload: {
        target: "atom:1",
        deltaX: 20,
        deltaY: 30,
      },
    });

    adapter.dispose();
  });

  it("releases the active target", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(event("mousedown", { button: 0, clientX: 1, clientY: 1 }));
    root.dispatchEvent(event("mouseup", { button: 0, clientX: 5, clientY: 7 }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "release",
      payload: { source: "mouse", target: "atom:1" },
    });

    adapter.dispose();
  });

  it("emits hover when no button is active", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(event("mousemove", { clientX: 50, clientY: 60 }));

    expect(sink.actions[0]).toMatchObject({
      type: "hover",
      payload: {
        source: "mouse",
        target: "atom:1",
        x: 50,
        y: 60,
      },
    });

    adapter.dispose();
  });

  it("uses the wheel for scale", () => {
    const { root, sink, adapter } = create();

    const wheel = event("wheel", { deltaY: 120 });
    root.dispatchEvent(wheel);

    expect(sink.actions[0]).toMatchObject({
      type: "scale",
      payload: {
        source: "mouse",
        delta: 0.12,
      },
    });

    adapter.dispose();
  });

  it("suppresses context menus", () => {
    const { root, adapter } = create();
    const context = event("contextmenu");
    root.dispatchEvent(context);

    expect(context.defaultPrevented).toBe(true);
    adapter.dispose();
  });

  it("preserves a shared event bus when the adapter is disposed", () => {
    const root = new FakeDomElement();
    const sink = createActionSink();
    const events = new InputEventBus();
    const listener = vi.fn();
    events.on("sourceAdded", listener);

    const adapter = new MouseInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => null,
      events,
    });

    adapter.dispose();
    events.emit("sourceAdded", { source: "mouse", id: "mouse-1" });

    expect(listener).toHaveBeenCalledWith({ source: "mouse", id: "mouse-1" });
  });

  it("exposes the shared event bus through on()", () => {
    const root = new FakeDomElement();
    const sink = createActionSink();
    const adapter = new MouseInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => null,
    });
    const listener = vi.fn();

    const unsubscribe = adapter.on("sourceAdded", listener);
    // The adapter does not synthesize sourceAdded itself; this checks that the
    // public subscription API is initialized safely after construction.
    adapter.dispose();
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not select with non-left buttons", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(event("mousedown", {
      button: 2,
      clientX: 1,
      clientY: 1,
    }));

    expect(sink.actions).toHaveLength(0);
    adapter.dispose();
  });
});
