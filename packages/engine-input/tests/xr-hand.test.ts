import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  XR_HAND_JOINTS,
  XrHandInputAdapter,
} from "../src/xr-hand.js";
import { InputEventBus } from "../src/event-bus.js";
import { makeFakeRenderer, makeNamedHandJointMap, makeXrSource } from "./helpers/fake-xr.js";
import { createActionSink } from "./helpers/test-actions.js";

describe("XrHandInputAdapter", () => {
  function makePositions(pinchDistance = 0.02) {
    const positions: Record<string, [number, number, number]> = {};

    for (const name of XR_HAND_JOINTS) positions[name] = [0, 0, 0];

    positions.wrist = [0, 0, 0];
    positions["thumb-tip"] = [0, 0, 0];
    positions["index-finger-tip"] = [pinchDistance, 0, 0];
    positions["index-finger-phalanx-proximal"] = [0, 0.03, 0];
    positions["middle-finger-tip"] = [0, 0.1, 0];
    positions["ring-finger-tip"] = [0, 0.1, 0];
    positions["pinky-finger-tip"] = [0, 0.1, 0];

    return positions;
  }

  function createHandAdapter(
    handedness: "left" | "right",
    pinchDistance = 0.02,
  ) {
    const sink = createActionSink();
    const events = new InputEventBus();
    const session = {
      inputSources: [
        makeXrSource(handedness, makeNamedHandJointMap()),
      ],
    };
    const renderer = makeFakeRenderer(session);
    const adapter = new XrHandInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      events,
      pick: () => ({ target: "electron:1" }),
    });

    const positions = makePositions(pinchDistance);
    const frame = {
      getJointPose: (space: any) => {
        const position = positions[space.__name];
        if (!position) return null;
        return {
          transform: {
            position: {
              x: position[0],
              y: position[1],
              z: position[2],
            },
          },
          radius: 0.008,
        };
      },
    };

    return { sink, events, renderer, adapter, frame };
  }

  it("exports all 25 WebXR joint names", () => {
    expect(XR_HAND_JOINTS).toHaveLength(25);
    expect(XR_HAND_JOINTS).toContain("wrist");
    expect(XR_HAND_JOINTS).toContain("thumb-tip");
    expect(XR_HAND_JOINTS).toContain("index-finger-tip");
    expect(XR_HAND_JOINTS).toContain("pinky-finger-tip");
  });

  it("reads a tracked hand and emits sourceAdded", () => {
    const { adapter, frame, events } = createHandAdapter("left");
    const added = vi.fn();
    events.on("sourceAdded", added);

    adapter.update(frame as any);

    expect(added).toHaveBeenCalledWith({
      source: "xr-hand",
      id: "hand-left",
    });

    adapter.dispose();
  });

  it("detects a pinch from thumb/index distance", () => {
    const { adapter, frame, sink } = createHandAdapter("left", 0.02);

    adapter.update(frame as any);

    expect(sink.actions.map((a) => a.type)).toContain("select");
    expect(sink.actions.map((a) => a.type)).toContain("grab");

    adapter.dispose();
  });

  it("does not pinch above the threshold", () => {
    const { adapter, frame, sink } = createHandAdapter("left", 0.08);

    adapter.update(frame as any);

    expect(sink.actions.some((a) => a.type === "select")).toBe(false);

    adapter.dispose();
  });

  it("uses the index-finger direction for target picking", () => {
    const pick = vi.fn(() => ({ target: "atom:1" }));
    const sink = createActionSink();
    const session = {
      inputSources: [
        makeXrSource("right", makeNamedHandJointMap()),
      ],
    };
    const renderer = makeFakeRenderer(session);

    const adapter = new XrHandInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      pick,
    });

    const positions = makePositions(0.02);
    const frame = {
      getJointPose: (space: any) => {
        const p = positions[space.__name];
        if (!p) return null;
        return {
          transform: { position: { x: p[0], y: p[1], z: p[2] } },
          radius: 0.008,
        };
      },
    };

    adapter.update(frame as any);

    expect(pick).toHaveBeenCalled();
    expect(pick.mock.calls[0]![0].source).toBe("xr-hand");
    expect(pick.mock.calls[0]![0].handedness).toBe("right");

    adapter.dispose();
  });

  it("ignores a session without hand input", () => {
    const sink = createActionSink();
    const renderer = makeFakeRenderer({
      inputSources: [makeXrSource("left", null)],
    });
    const adapter = new XrHandInputAdapter({
      renderer,
      dispatch: sink.dispatch,
    });

    adapter.update({
      getJointPose: () => null,
    } as any);

    expect(sink.actions).toHaveLength(0);
    adapter.dispose();
  });

  it("removes a hand when it disappears from the session", () => {
    const sink = createActionSink();
    const events = new InputEventBus();
    const removed = vi.fn();
    events.on("sourceRemoved", removed);

    const session: any = {
      inputSources: [makeXrSource("left", makeNamedHandJointMap())],
    };
    const renderer = makeFakeRenderer(session);
    const adapter = new XrHandInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      events,
    });

    const positions = makePositions(0.02);
    const frame: any = {
      getJointPose: (space: any) => {
        const p = positions[space.__name];
        return p
          ? { transform: { position: { x: p[0], y: p[1], z: p[2] } }, radius: 0.008 }
          : null;
      },
    };

    adapter.update(frame);
    session.inputSources = [];
    adapter.update(frame);

    expect(removed).toHaveBeenCalledWith({
      source: "xr-hand",
      id: "hand-left",
    });

    adapter.dispose();
  });

  it("can create and clean up debug joint objects", () => {
    const sink = createActionSink();
    const renderer = makeFakeRenderer({
      inputSources: [makeXrSource("left", makeNamedHandJointMap())],
    });
    const adapter = new XrHandInputAdapter({
      renderer,
      dispatch: sink.dispatch,
      showJointDebug: true,
    });

    expect(() => adapter.dispose()).not.toThrow();
  });
});
