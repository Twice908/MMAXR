import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GestureRecognizer } from "../src/gestures.js";
import { InputEventBus } from "../src/event-bus.js";
import { ActionDispatcher } from "../src/action-dispatcher.js";
import { createActionSink, payloadNumber } from "./helpers/test-actions.js";

describe("GestureRecognizer", () => {
  function create() {
    const sink = createActionSink();
    const events = new InputEventBus();
    const dispatcher = new ActionDispatcher(sink.dispatch, events);
    const recognizer = new GestureRecognizer(
      "xr-hand",
      "hand-left",
      dispatcher,
      events,
      {
        pinchStartDistance: 0.03,
        pinchEndDistance: 0.05,
        grabCurlThreshold: 0.7,
        gestureSmoothing: 1,
      },
    );
    return { sink, events, recognizer };
  }

  const snapshot = (
    x: number,
    pinchDistance: number,
    fingerCurl = 0,
    handedness: "left" | "right" = "left",
  ) => ({
    handedness,
    position: new THREE.Vector3(x, 0, 0),
    pinchDistance,
    fingerCurl,
    timestamp: performance.now(),
  });

  it("starts a pinch below the start threshold", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02));

    expect(sink.actions.map((a) => a.type)).toEqual(["select", "grab"]);
  });

  it("uses hysteresis so a pinch remains active between thresholds", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02));
    recognizer.updateHand(snapshot(0.01, 0.04));

    expect(sink.actions.map((a) => a.type)).toEqual([
      "select",
      "grab",
      "move",
    ]);
  });

  it("ends the pinch above the end threshold", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02));
    recognizer.updateHand(snapshot(0.01, 0.06));

    expect(sink.actions.at(-1)?.type).toBe("release");
  });

  it("detects grab from finger curl", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.1, 0.9));

    expect(sink.actions[0]?.type).toBe("grab");
  });

  it("moves while grabbing", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.1, 0.9));
    recognizer.updateHand(snapshot(0.01, 0.1, 0.9));

    expect(sink.actions.at(-1)?.type).toBe("move");
  });

  it("does not emit movement below the deadzone", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.1, 0.9));
    recognizer.updateHand(snapshot(0.0001, 0.1, 0.9));

    expect(sink.actions.filter((a) => a.type === "move")).toHaveLength(0);
  });

  it("emits two-hand scale", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02, 0, "left"));
    recognizer.updateHand(snapshot(1, 0.02, 0, "right"));
    recognizer.updateHand(snapshot(1.2, 0.02, 0, "right"));

    expect(sink.actions.some((a) => a.type === "scale")).toBe(true);
    const scale = sink.actions.find((a) => a.type === "scale");
    expect(payloadNumber(scale, "scale")).toBeCloseTo(1.2);
  });

  it("emits two-hand rotation", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02, 0, "left"));
    recognizer.updateHand(snapshot(1, 0.02, 0, "right"));

    recognizer.updateHand(snapshot(0, 0.02, 0, "left"));
    recognizer.updateHand(
      {
        ...snapshot(0, 0.02, 0, "right"),
        position: new THREE.Vector3(0, 1, 0),
      },
    );

    expect(sink.actions.some((a) => a.type === "rotate")).toBe(true);
  });

  it("removes a hand and emits release for an active gesture", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02));
    recognizer.removeHand("left");

    expect(sink.actions.at(-1)?.type).toBe("release");
  });

  it("reset clears active state", () => {
    const { sink, recognizer } = create();

    recognizer.updateHand(snapshot(0, 0.02));
    recognizer.reset();
    recognizer.updateHand(snapshot(0.01, 0.06));

    expect(sink.actions.filter((a) => a.type === "move")).toHaveLength(0);
  });
});
