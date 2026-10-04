import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { XrControllerInputAdapter } from "../src/xr-controller.js";
import { InputEventBus } from "../src/event-bus.js";
import { createActionSink } from "./helpers/test-actions.js";
import { asWebGLRenderer, dispatchControllerEvent, makeFakeRenderer } from "./helpers/fake-xr.js";

describe("XrControllerInputAdapter", () => {
  it("creates controller and grip spaces", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
    });

    expect(adapter.getController(0)).toBeInstanceOf(THREE.Group);
    expect(adapter.getControllerGrip(0)).toBeInstanceOf(THREE.Group);

    adapter.dispose();
  });

  it("emits sourceAdded with handedness on connect", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const events = new InputEventBus();
    const added = vi.fn();
    events.on("sourceAdded", added);

    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      events,
    });

    const controller = adapter.getController(0);
    dispatchControllerEvent(controller, "connected", { handedness: "right" });

    expect(added).toHaveBeenCalledWith({
      source: "xr-controller",
      id: "controller-0",
    });

    adapter.dispose();
  });

  it("picks and hovers a target", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      pick: () => ({ target: "atom:1" }),
    });

    adapter.update();

    expect(sink.actions[0]).toMatchObject({
      type: "hover",
      payload: {
        source: "xr-controller",
        target: "atom:1",
      },
    });

    adapter.dispose();
  });

  it("selects and releases a target", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      pick: () => ({ target: "atom:1" }),
    });

    adapter.update();
    const controller = adapter.getController(0);

    dispatchControllerEvent(controller, "connected", { handedness: "left" });
    dispatchControllerEvent(controller, "selectstart");
    dispatchControllerEvent(controller, "selectend");

    expect(sink.actions.map((a) => a.type)).toContain("grab");
    expect(sink.actions.map((a) => a.type)).toContain("release");

    adapter.dispose();
  });

  it("supports squeeze as the activation button", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      pick: () => ({ target: "atom:2" }),
      selectButton: "squeeze",
      controllerCount: 1,
    });

    adapter.update();
    const controller = adapter.getController(0);

    dispatchControllerEvent(controller, "connected", { handedness: "right" });
    dispatchControllerEvent(controller, "squeezestart");
    dispatchControllerEvent(controller, "squeezeend");

    expect(sink.actions.map((a) => a.type)).toEqual(["hover", "grab", "release"]);

    adapter.dispose();
  });

  it("releases an active grab on disconnect", () => {
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const sink = createActionSink();
    const adapter = new XrControllerInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      pick: () => ({ target: "atom:3" }),
    });

    adapter.update();
    const controller = adapter.getController(0);
    dispatchControllerEvent(controller, "connected", { handedness: "left" });
    dispatchControllerEvent(controller, "selectstart");
    dispatchControllerEvent(controller, "disconnected");

    expect(sink.actions.at(-1)).toMatchObject({
      type: "release",
      payload: { cancelled: true },
    });

    adapter.dispose();
  });
});
