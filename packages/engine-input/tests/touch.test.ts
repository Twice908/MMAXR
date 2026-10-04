import { describe, expect, it } from "vitest";
import { TouchInputAdapter } from "../src/touch.js";
import { FakeDomElement, pointerEvent } from "./helpers/fake-dom.js";
import { createActionSink } from "./helpers/test-actions.js";

describe("TouchInputAdapter", () => {
  function create() {
    const root = new FakeDomElement();
    const sink = createActionSink();
    const adapter = new TouchInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => "electron:1",
      pinchSensitivity: 0.008,
    });
    return { root, sink, adapter };
  }

  it("selects on first touch", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    }));

    expect(sink.actions[0]).toMatchObject({
      type: "select",
      payload: {
        source: "touch",
        target: "electron:1",
      },
    });
    expect(root.capturedPointers.has(1)).toBe(true);

    adapter.dispose();
  });

  it("rotates the picked scene after a drag threshold", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: 110, clientY: 115,
    }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "rotate",
      payload: {
        source: "touch",
        deltaX: 10,
        deltaY: 15,
      },
    });

    adapter.dispose();
  });

  it("counts small touch moves cumulatively toward the drag threshold", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: 102, clientY: 101,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: 104, clientY: 102,
    }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "rotate",
      payload: {
        source: "touch",
        deltaX: 2,
        deltaY: 1,
      },
    });

    adapter.dispose();
  });

  it("releases on pointerup", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10,
    }));
    root.dispatchEvent(pointerEvent("pointerup", {
      pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10,
    }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "release",
      payload: {
        source: "touch",
        target: "electron:1",
      },
    });
    expect(root.releasedPointers).toContain(1);

    adapter.dispose();
  });

  it("scales on two-finger pinch", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 2, pointerType: "touch", clientX: 240, clientY: 100,
    }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "scale",
      payload: {
        source: "touch",
        delta: -0.32,
      },
    });

    adapter.dispose();
  });

  it("ignores pinch movement inside the configured dead zone", () => {
    const root = new FakeDomElement();
    const sink = createActionSink();
    const adapter = new TouchInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => null,
      pinchSensitivity: 0.008,
      pinchDeadZonePx: 3,
    });

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 2, pointerType: "touch", clientX: 202, clientY: 100,
    }));

    expect(sink.actions.filter((action) => action.type === "scale")).toHaveLength(0);

    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 2, pointerType: "touch", clientX: 205, clientY: 100,
    }));
    const scaleActions = sink.actions.filter((action) => action.type === "scale");
    expect(scaleActions).toHaveLength(1);
    expect(scaleActions[0]?.payload).toMatchObject({ source: "touch" });
    expect((scaleActions[0]?.payload as { delta: number }).delta).toBeCloseTo(-0.04);

    adapter.dispose();
  });

  it("ignores HUD pointers and does not let them join a camera-area pinch", () => {
    const root = new FakeDomElement();
    const sink = createActionSink();
    let downOnHud = false;
    const adapter = new TouchInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: sink.dispatch,
      pickTarget: () => null,
      shouldIgnoreTarget: (target) => downOnHud && target === root,
    });

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100,
    }));
    downOnHud = true;
    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100,
    }));
    downOnHud = false;
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 2, pointerType: "touch", clientX: 240, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: 102, clientY: 100,
    }));

    downOnHud = true;
    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 3, pointerType: "touch", clientX: 300, clientY: 100,
    }));
    downOnHud = false;
    root.dispatchEvent(pointerEvent("pointermove", {
      pointerId: 3, pointerType: "touch", clientX: 340, clientY: 100,
    }));
    root.dispatchEvent(pointerEvent("pointerup", {
      pointerId: 3, pointerType: "touch", clientX: 340, clientY: 100,
    }));

    expect(sink.actions.filter((action) => action.type === "scale")).toHaveLength(0);
    expect(sink.actions.filter((action) => action.type === "rotate")).toHaveLength(0);
    adapter.dispose();
  });

  it("does not treat mouse pointer events as touch", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "mouse", clientX: 1, clientY: 1,
    }));

    expect(sink.actions).toHaveLength(0);
    adapter.dispose();
  });

  it("releases active state on pointercancel", () => {
    const { root, sink, adapter } = create();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10,
    }));
    root.dispatchEvent(pointerEvent("pointercancel", {
      pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10,
    }));

    expect(sink.actions.at(-1)).toMatchObject({
      type: "release",
      payload: {
        source: "touch",
        cancelled: true,
      },
    });

    adapter.dispose();
  });
});
