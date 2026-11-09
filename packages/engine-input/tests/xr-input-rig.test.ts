import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { XrInputRig, formatXrInputDiagnostics, type XrInputRigOptions } from "../src/xr-input-rig.js";
import {
  makeController,
  makeFrame,
  makeHand,
  makePose,
  makeSession,
  press,
  setPinchGap,
  type FakeSource,
} from "./helpers/fake-xr.js";

const TRIGGER = 0;
const SQUEEZE = 1;
const THUMBSTICK_CLICK = 3;
const PRIMARY = 4;
const SECONDARY = 5;

function setup(initial: FakeSource[] = [], overrides: Partial<XrInputRigOptions> = {}) {
  const session = makeSession(initial);
  const referenceSpace = {} as XRReferenceSpace;
  const panel = { hit: false };
  const dispatch = vi.fn();
  const handlePanelRay = vi.fn(() => panel.hit);
  const pick = vi.fn(() => ({ target: "atom:1" }) as { target: string } | null);
  const rig = new XrInputRig({
    dispatch,
    pick,
    handlePanelRay,
    getReferenceSpace: () => referenceSpace,
    primaryCommand: "lesson/check",
    ...overrides,
  });
  rig.setSession(session.session);
  let time = 0;
  const step = (): void => {
    time += 16;
    rig.update(makeFrame(), time);
  };
  const calls = (phase: string) => handlePanelRay.mock.calls.filter((call) => (call as unknown[])[1] === phase);
  const actions = (type: string) => dispatch.mock.calls
    .map((call) => call[0] as { type: string; payload: Record<string, unknown> })
    .filter((action) => action.type === type);
  return { session, rig, panel, dispatch, handlePanelRay, pick, step, calls, actions, referenceSpace };
}

describe("controller trigger", () => {
  it("presses and releases a panel ray from the gamepad trigger", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.step();
    press(controller, TRIGGER);
    t.step();
    expect(t.handlePanelRay).toHaveBeenCalledWith(
      expect.any(THREE.Ray), "down", "xr-source-right-1", "controller", "rotate",
    );
    press(controller, TRIGGER, false);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
  });

  it("selects the picked object on release when no panel captured the press", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.step();
    press(controller, TRIGGER, false);
    t.step();
    expect(t.actions("select")).toEqual([
      { type: "select", payload: { source: "xr-controller", target: "atom:1" } },
    ]);
  });

  it("does not select an object when a panel captured the press", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.panel.hit = true;
    press(controller, TRIGGER);
    t.step();
    press(controller, TRIGGER, false);
    t.step();
    expect(t.actions("select")).toHaveLength(0);
  });

  it("works from select events alone when the source has no gamepad", () => {
    const controller = makeController({ gamepad: false });
    const t = setup([controller]);
    t.session.fire("selectstart", controller);
    expect(t.calls("down")).toHaveLength(1);
    t.session.fire("selectend", controller);
    expect(t.calls("up")).toHaveLength(1);
  });

  it("does not double-fire when events and gamepad report the same press", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.session.fire("selectstart", controller);
    t.step();
    press(controller, TRIGGER, false);
    t.session.fire("selectend", controller);
    t.step();
    expect(t.calls("down")).toHaveLength(1);
    expect(t.calls("up")).toHaveLength(1);
  });

  it("reads rays in the renderer's reference space", () => {
    const controller = makeController();
    const t = setup([controller]);
    const frame = makeFrame();
    const getPose = vi.spyOn(frame, "getPose");
    t.rig.update(frame, 16);
    expect(getPose).toHaveBeenCalledWith(controller.source.targetRaySpace, t.referenceSpace);
  });

  it("does nothing until a reference space exists", () => {
    const controller = makeController();
    const t = setup([controller], { getReferenceSpace: () => null });
    press(controller, TRIGGER);
    t.step();
    expect(t.handlePanelRay).not.toHaveBeenCalled();
  });
});

describe("controller squeeze and buttons", () => {
  it("pans while squeezing and ignores the trigger during that press", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, SQUEEZE);
    t.step();
    expect(t.handlePanelRay).toHaveBeenCalledWith(
      expect.any(THREE.Ray), "down", "xr-source-right-1", "controller", "pan",
    );
    press(controller, TRIGGER);
    t.step();
    press(controller, TRIGGER, false);
    t.step();
    expect(t.calls("down")).toHaveLength(1);
    expect(t.calls("up")).toHaveLength(0);
    press(controller, SQUEEZE, false);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
  });

  it("releasing the squeeze does not end a held trigger press", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.step();
    press(controller, SQUEEZE);
    t.step();
    press(controller, SQUEEZE, false);
    t.step();
    expect(t.calls("up")).toHaveLength(0);
    press(controller, TRIGGER, false);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
  });

  it("A/X confirms the lesson step when no panel is under the ray", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, PRIMARY);
    t.step();
    expect(t.actions("confirm")).toEqual([
      { type: "confirm", payload: { source: "xr-controller", command: "lesson/check" } },
    ]);
  });

  it("A/X clicks the panel under the ray instead of confirming", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.panel.hit = true;
    press(controller, PRIMARY);
    t.step();
    expect(t.actions("confirm")).toHaveLength(0);
    expect(t.calls("down")).toHaveLength(1);
    expect(t.calls("up")).toHaveLength(1);
  });

  it("B/Y goes back and thumbstick click does nothing", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, THUMBSTICK_CLICK);
    t.step();
    expect(t.actions("back")).toHaveLength(0);
    expect(t.actions("confirm")).toHaveLength(0);
    press(controller, SECONDARY);
    t.step();
    expect(t.actions("back")).toHaveLength(1);
  });

  it("only fires each button once per press", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, SECONDARY);
    t.step();
    t.step();
    t.step();
    expect(t.actions("back")).toHaveLength(1);
  });
});

describe("thumbstick", () => {
  it("ignores a centred stick", () => {
    const controller = makeController();
    const handleThumbstick = vi.fn(() => true);
    const t = setup([controller], { handleThumbstick });
    controller.axes[2] = 0.05;
    t.step();
    expect(handleThumbstick).not.toHaveBeenCalled();
  });

  it("passes the deflection, source and frame time to the handler", () => {
    const controller = makeController({ handedness: "left" });
    const handleThumbstick = vi.fn(() => true);
    const t = setup([controller], { handleThumbstick });
    t.step();
    controller.axes[2] = 1;
    t.step();
    expect(handleThumbstick).toHaveBeenCalledWith(
      { x: expect.closeTo(1), y: expect.closeTo(0) },
      "xr-source-left-1",
      "left",
      expect.closeTo(0.016),
    );
    expect(t.actions("rotate")).toHaveLength(0);
  });

  it("falls back to a rotate action when the handler declines", () => {
    const controller = makeController();
    const t = setup([controller], { handleThumbstick: () => false });
    t.step();
    controller.axes[2] = 1;
    t.step();
    expect(t.actions("rotate")).toHaveLength(1);
    expect(t.actions("rotate")[0]!.payload.source).toBe("xr-controller");
  });

  it("is not used while a press is active", () => {
    const controller = makeController();
    const handleThumbstick = vi.fn(() => true);
    const t = setup([controller], { handleThumbstick });
    press(controller, TRIGGER);
    controller.axes[2] = 1;
    t.step();
    expect(handleThumbstick).not.toHaveBeenCalled();
  });
});

describe("hover and haptics", () => {
  it("hovers the picked object when no panel is hit", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.step();
    expect(t.actions("hover")).toEqual([
      { type: "hover", payload: { source: "xr-controller", target: "atom:1" } },
    ]);
  });

  it("skips the world picker while a panel consumes the ray", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.panel.hit = true;
    t.step();
    expect(t.pick).not.toHaveBeenCalled();
  });

  it("pulses controller haptics on a panel press and release", () => {
    const controller = makeController({ haptics: true });
    const t = setup([controller]);
    t.panel.hit = true;
    press(controller, TRIGGER);
    t.step();
    press(controller, TRIGGER, false);
    t.step();
    expect(controller.pulses.length).toBeGreaterThanOrEqual(2);
  });

  it("survives a haptic actuator that throws", () => {
    const controller = makeController({ haptics: true });
    const gamepad = controller.source.gamepad as unknown as { hapticActuators: { pulse: () => never }[] };
    gamepad.hapticActuators[0]!.pulse = () => {
      throw new Error("no motor");
    };
    const t = setup([controller]);
    t.panel.hit = true;
    press(controller, TRIGGER);
    expect(() => t.step()).not.toThrow();
  });

  it("reports pointer frames with hit distance and press state", () => {
    const controller = makeController();
    const onPointerFrame = vi.fn();
    const t = setup([controller], { getHitDistance: () => 1.2, onPointerFrame });
    t.step();
    expect(onPointerFrame).toHaveBeenCalledWith(expect.objectContaining({
      kind: "controller",
      handedness: "right",
      tracked: true,
      hitDistance: 1.2,
      pressed: false,
      inputSource: controller.source,
    }));
    press(controller, TRIGGER);
    t.step();
    expect(onPointerFrame).toHaveBeenLastCalledWith(expect.objectContaining({ pressed: true }));
  });
});

describe("hands", () => {
  it("uses the hand gamepad pinch button when the runtime provides one", () => {
    const hand = makeHand({ gamepad: true });
    const t = setup([hand]);
    press(hand, TRIGGER);
    t.step();
    expect(t.handlePanelRay).toHaveBeenCalledWith(
      expect.any(THREE.Ray), "down", "xr-source-right-1", "hand", "rotate",
    );
    expect(t.rig.getDiagnostics()[0]!.systemSelectSeen).toBe(true);
    press(hand, TRIGGER, false);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
  });

  it("uses select events for a pinch", () => {
    const hand = makeHand();
    const t = setup([hand]);
    t.session.fire("selectstart", hand);
    expect(t.calls("down")).toHaveLength(1);
    t.session.fire("selectend", hand);
    expect(t.calls("up")).toHaveLength(1);
    expect(t.handlePanelRay).toHaveBeenCalledWith(
      expect.any(THREE.Ray), "up", "xr-source-right-1", "hand", "rotate",
    );
  });

  it("falls back to fingertip distance with hysteresis when nothing else reports a pinch", () => {
    const hand = makeHand();
    const t = setup([hand]);
    t.step();
    setPinchGap(hand, 0.015);
    t.step();
    expect(t.calls("down")).toHaveLength(1);
    setPinchGap(hand, 0.03);
    t.step();
    expect(t.calls("up")).toHaveLength(0);
    setPinchGap(hand, 0.06);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
    expect(t.rig.getDiagnostics()[0]!.systemSelectSeen).toBe(false);
  });

  it("stops using joints once the system reports a pinch", () => {
    const hand = makeHand();
    const t = setup([hand]);
    t.session.fire("selectstart", hand);
    setPinchGap(hand, 0.06);
    t.step();
    expect(t.calls("up")).toHaveLength(0);
    t.session.fire("selectend", hand);
    expect(t.calls("up")).toHaveLength(1);
    setPinchGap(hand, 0.01);
    t.step();
    expect(t.calls("down")).toHaveLength(1);
  });

  it("hands a joint-detected pinch over to the system signal without a second press", () => {
    const hand = makeHand();
    const t = setup([hand]);
    setPinchGap(hand, 0.015);
    t.step();
    t.session.fire("selectstart", hand);
    expect(t.calls("down")).toHaveLength(1);
    setPinchGap(hand, 0.07);
    t.step();
    expect(t.calls("up")).toHaveLength(0);
    t.session.fire("selectend", hand);
    expect(t.calls("up")).toHaveLength(1);
  });

  it("selects the picked object on a pinch that missed every panel", () => {
    const hand = makeHand();
    const t = setup([hand]);
    t.session.fire("selectstart", hand);
    t.session.fire("selectend", hand);
    expect(t.actions("select")).toEqual([
      { type: "select", payload: { source: "xr-hand", target: "atom:1" } },
    ]);
  });

  it("does not map controller buttons from a hand's gamepad", () => {
    const hand = makeHand({ gamepad: true });
    const t = setup([hand]);
    press(hand, PRIMARY);
    press(hand, SECONDARY);
    t.step();
    expect(t.actions("confirm")).toHaveLength(0);
    expect(t.actions("back")).toHaveLength(0);
  });

  it("cancels a press when the hand loses tracking", () => {
    const hand = makeHand();
    const t = setup([hand]);
    t.session.fire("selectstart", hand);
    hand.rayPose = null;
    for (let frame = 0; frame < 12; frame += 1) t.step();
    expect(t.calls("cancel")).toHaveLength(1);
    t.session.fire("selectend", hand);
    expect(t.calls("up")).toHaveLength(0);
  });
});

describe("tracking loss and source changes", () => {
  it("cancels an active press after the pose is lost for too long", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.step();
    controller.rayPose = null;
    for (let frame = 0; frame < 11; frame += 1) t.step();
    expect(t.calls("cancel")).toHaveLength(0);
    t.step();
    expect(t.calls("cancel")).toHaveLength(1);
    press(controller, TRIGGER, false);
    t.step();
    expect(t.calls("up")).toHaveLength(0);
  });

  it("releases a press at the last known ray when a pose drops only briefly", () => {
    const controller = makeController();
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.step();
    controller.rayPose = null;
    t.step();
    press(controller, TRIGGER, false);
    t.step();
    expect(t.calls("up")).toHaveLength(1);
    expect(t.calls("cancel")).toHaveLength(0);
  });

  it("cancels and reports a removed source, then adds the replacement", () => {
    const controller = makeController();
    const hand = makeHand({ handedness: "left" });
    const t = setup([controller]);
    const added = vi.fn();
    const removed = vi.fn();
    t.rig.on("sourceAdded", added);
    t.rig.on("sourceRemoved", removed);
    press(controller, TRIGGER);
    t.step();
    t.session.change([hand], [controller]);
    expect(removed).toHaveBeenCalledWith({ source: "xr-controller", id: "xr-source-right-1" });
    expect(t.calls("cancel").length).toBeGreaterThanOrEqual(1);
    expect(added).toHaveBeenCalledWith({ source: "xr-hand", id: "xr-source-left-2" });
    expect(t.rig.getDiagnostics().map((entry) => entry.kind)).toEqual(["hand"]);
  });

  it("detaches every listener when the session ends", () => {
    const controller = makeController();
    const t = setup([controller]);
    const removed = vi.fn();
    t.rig.on("sourceRemoved", removed);
    expect(t.session.listenerCount()).toBeGreaterThan(0);
    t.session.session.dispatchEvent(new Event("end"));
    expect(t.session.listenerCount()).toBe(0);
    expect(removed).toHaveBeenCalledOnce();
    t.session.fire("selectstart", controller);
    expect(t.calls("down")).toHaveLength(0);
  });

  it("detaches on dispose and ignores later frames", () => {
    const controller = makeController();
    const t = setup([controller]);
    t.rig.dispose();
    expect(t.session.listenerCount()).toBe(0);
    press(controller, TRIGGER);
    t.step();
    expect(t.calls("down")).toHaveLength(0);
  });
});

describe("transient pointers (phone AR taps)", () => {
  it("routes a tap to the panel and removes the one-shot source", () => {
    const tap = makeController({ targetRayMode: "transient-pointer", handedness: "none", gamepad: false });
    const t = setup();
    const removed = vi.fn();
    t.rig.on("sourceRemoved", removed);
    t.panel.hit = true;
    t.session.change([tap], []);
    t.session.fire("select", tap);
    expect(t.calls("down")).toHaveLength(1);
    expect(t.calls("up")).toHaveLength(1);
    expect(t.actions("select")).toHaveLength(0);
    expect(removed).toHaveBeenCalledOnce();
  });

  it("selects the picked object when the tap missed every panel", () => {
    const tap = makeController({ targetRayMode: "transient-pointer", handedness: "none", gamepad: false });
    const t = setup();
    t.session.change([tap], []);
    t.session.fire("select", tap);
    expect(t.actions("select")).toHaveLength(1);
  });

  it("is not treated as a persistent pointer in frame updates", () => {
    const tap = makeController({ targetRayMode: "transient-pointer", handedness: "none", gamepad: false });
    const t = setup([tap]);
    t.step();
    expect(t.handlePanelRay).not.toHaveBeenCalled();
  });
});

describe("paired zoom", () => {
  it("sends the change in separation between two squeezing controllers", () => {
    const left = makeController({ handedness: "left" });
    const right = makeController({ handedness: "right" });
    left.gripPose = makePose(-0.25, 0, 0);
    right.gripPose = makePose(0.25, 0, 0);
    const t = setup([left, right]);
    t.panel.hit = true;
    press(left, SQUEEZE);
    press(right, SQUEEZE);
    t.step();
    left.gripPose = makePose(-0.4, 0, 0);
    right.gripPose = makePose(0.4, 0, 0);
    t.step();
    const zooms = t.calls("move").map((call) => (call as unknown[])[5] as number | undefined);
    expect(zooms.filter((zoom) => zoom !== undefined && Math.abs(zoom - 0.3) < 1e-6)).toHaveLength(1);
  });

  it("does not zoom with only one source pressing", () => {
    const left = makeController({ handedness: "left" });
    const right = makeController({ handedness: "right" });
    const t = setup([left, right]);
    t.panel.hit = true;
    press(left, SQUEEZE);
    t.step();
    t.step();
    const zooms = t.calls("move").map((call) => (call as unknown[])[5]);
    expect(zooms.every((zoom) => zoom === undefined)).toBe(true);
  });
});

describe("diagnostics", () => {
  it("describes each source without personal data", () => {
    const controller = makeController({ profiles: ["meta-quest-touch-plus", "oculus-touch-v3"], haptics: true });
    const t = setup([controller]);
    press(controller, TRIGGER);
    t.session.fire("selectstart", controller);
    t.step();
    const [entry] = t.rig.getDiagnostics();
    expect(entry).toMatchObject({
      id: "xr-source-right-1",
      kind: "controller",
      handedness: "right",
      targetRayMode: "tracked-pointer",
      profiles: ["meta-quest-touch-plus", "oculus-touch-v3"],
      hasGamepad: true,
      rayTracked: true,
      select: true,
      press: "select",
      selectEvents: 1,
      pressedButtons: [TRIGGER],
    });
    expect(t.rig.getFrameCount()).toBe(1);
  });

  it("formats readable report lines", () => {
    const controller = makeController({ profiles: ["oculus-touch-v3"] });
    const t = setup([controller]);
    t.step();
    const lines = formatXrInputDiagnostics(t.rig.getDiagnostics());
    expect(lines[0]).toContain("Input xr-source-right-1 (controller/right)");
    expect(lines.join("\n")).toContain("oculus-touch-v3");
    expect(formatXrInputDiagnostics([])).toEqual(["Input sources: none"]);
  });
});
