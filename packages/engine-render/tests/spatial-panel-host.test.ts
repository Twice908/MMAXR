import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  consumeSpatialPanelHit,
  createSpatialPanelHost,
} from "../src/visuals/spatial-panel-host.js";
import type { SpatialPointerEvent, SpatialPointerTarget } from "../src/visuals/spatial-pointer.js";

function makePointerTarget(
  group: THREE.Group,
  onPointerEvent: (event: SpatialPointerEvent) => void,
  getPointerValue?: (ray: THREE.Ray) => number | null,
  id = "button:check",
) {
  const object3d = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  group.add(object3d);
  const setState = vi.fn();
  const target: SpatialPointerTarget = {
    id,
    object3d,
    disabled: false,
    onPointerEvent,
    ...(getPointerValue ? { getPointerValue } : {}),
    setState,
  };
  return { target, object3d, setState };
}

function makeHost(
  group: THREE.Group,
  pointerTarget: HTMLElement,
  target: SpatialPointerTarget,
  enablePointerEvents = false,
) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  group.updateMatrixWorld(true);
  return createSpatialPanelHost({
    group,
    camera,
    pointerTarget,
    panels: [],
    pointerTargets: [target],
    onPanelAction: vi.fn(),
    enablePointerEvents,
  });
}

function makePointerEvent(
  type: "move" | "down" | "up",
  pointerType: "mouse" | "touch",
  pointerId: number,
  clientX = 50,
  clientY = 50,
): PointerEvent {
  return Object.assign(new Event(`pointer${type}`, { cancelable: true }), {
    clientX,
    clientY,
    pointerId,
    pointerType,
  }) as PointerEvent;
}

describe("spatial panel ray consumption", () => {
  it("consumes a panel hit without forwarding the ray to the atom picker", () => {
    const action = vi.fn();
    const atomPicker = vi.fn();

    const consumed = consumeSpatialPanelHit(true, "lesson:check", action, atomPicker);

    expect(consumed).toBe(true);
    expect(action).toHaveBeenCalledWith("lesson:check");
    expect(atomPicker).not.toHaveBeenCalled();
  });

  it("forwards a miss to the atom picker", () => {
    const atomPicker = vi.fn();
    expect(consumeSpatialPanelHit(false, null, vi.fn(), atomPicker)).toBe(false);
    expect(atomPicker).toHaveBeenCalledOnce();
  });

  it("routes controller and hand rays through the shared pointer-event API", () => {
    const group = new THREE.Group();
    const events: SpatialPointerEvent[] = [];
    const { target, object3d, setState } = makePointerTarget(group, (event) => events.push(event));
    const host = makeHost(group, new EventTarget() as HTMLElement, target);
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
    const miss = new THREE.Ray(new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, -1));

    expect(host.handleRay(ray, "move", "controller:1", "controller")).toBe(true);
    expect(host.handleRay(ray, "down", "controller:1", "controller")).toBe(true);
    expect(host.handleRay(ray, "move", "controller:1", "controller")).toBe(true);
    expect(host.handleRay(ray, "up", "controller:1", "controller")).toBe(true);
    expect(host.handleRay(miss, "move", "controller:1", "controller")).toBe(false);
    expect(host.handleRay(ray, "move", "hand:1", "hand")).toBe(true);
    expect(host.handleRay(ray, "down", "hand:1", "hand")).toBe(true);
    expect(host.handleRay(ray, "up", "hand:1", "hand")).toBe(true);
    expect(host.handleRay(miss, "move", "hand:1", "hand")).toBe(false);

    expect(events.map(({ type }) => type)).toEqual([
      "enter", "move", "down", "drag", "up", "click", "leave",
      "enter", "move", "down", "up", "click", "leave",
    ]);
    expect(events.filter(({ type }) => type === "click").map(({ source }) => source)).toEqual([
      "controller",
      "hand",
    ]);
    expect(setState).toHaveBeenCalledWith({ pressed: true });
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ pressed: false }));
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("routes mouse and touch pointer events through the shared target API", () => {
    const group = new THREE.Group();
    const events: SpatialPointerEvent[] = [];
    const { target, object3d } = makePointerTarget(group, (event) => events.push(event));
    const pointerTarget = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }) as HTMLElement;
    const host = makeHost(group, pointerTarget, target, true);

    for (const [pointerType, pointerId] of [["mouse", 1], ["touch", 2]] as const) {
      pointerTarget.dispatchEvent(makePointerEvent("move", pointerType, pointerId));
      pointerTarget.dispatchEvent(makePointerEvent("down", pointerType, pointerId));
      pointerTarget.dispatchEvent(makePointerEvent("move", pointerType, pointerId));
      pointerTarget.dispatchEvent(makePointerEvent("up", pointerType, pointerId));
    }

    expect(events.filter(({ type }) => type === "click").map(({ source }) => source)).toEqual([
      "mouse",
      "touch",
    ]);
    expect(events.filter(({ type }) => type === "drag").map(({ source }) => source)).toEqual([
      "mouse",
      "touch",
    ]);
    host.dispose();
    expect(events.filter(({ type }) => type === "leave").map(({ source }) => source)).toEqual([
      "mouse",
      "touch",
    ]);
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("routes model targets before one-finger background look-around", () => {
    const group = new THREE.Group();
    const { target, object3d } = makePointerTarget(group, vi.fn(), undefined, "model-stage");
    const pointerTarget = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }) as HTMLElement;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const background = vi.fn();
    const host = createSpatialPanelHost({
      group,
      camera,
      pointerTarget,
      panels: [],
      pointerTargets: [target],
      onPanelAction: vi.fn(),
      onBackgroundPointer: background,
      enablePointerEvents: true,
    });

    pointerTarget.dispatchEvent(makePointerEvent("down", "touch", 1));
    pointerTarget.dispatchEvent(makePointerEvent("up", "touch", 1));
    expect(background).not.toHaveBeenCalled();

    pointerTarget.dispatchEvent(makePointerEvent("down", "touch", 2, 99, 50));
    pointerTarget.dispatchEvent(makePointerEvent("move", "touch", 2, 90, 55));
    pointerTarget.dispatchEvent(makePointerEvent("up", "touch", 2, 90, 55));
    expect(background.mock.calls.map(([event]) => event.phase)).toEqual([
      "down", "move", "up",
    ]);
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("cancels background look-around when a second finger is added", () => {
    const group = new THREE.Group();
    const { target, object3d } = makePointerTarget(group, vi.fn(), undefined, "model-stage");
    const pointerTarget = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }) as HTMLElement;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const background = vi.fn();
    const host = createSpatialPanelHost({
      group,
      camera,
      pointerTarget,
      panels: [],
      pointerTargets: [target],
      onPanelAction: vi.fn(),
      onBackgroundPointer: background,
      enablePointerEvents: true,
    });

    pointerTarget.dispatchEvent(makePointerEvent("down", "touch", 1, 99, 50));
    pointerTarget.dispatchEvent(makePointerEvent("down", "touch", 2, 99, 50));
    expect(background.mock.calls.map(([event]) => event.phase)).toEqual(["down", "cancel"]);
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("keeps captured slider values flowing while a drag leaves the hit area", () => {
    const group = new THREE.Group();
    const events: SpatialPointerEvent[] = [];
    const { target, object3d } = makePointerTarget(
      group,
      (event) => events.push(event),
      (ray) => ray.origin.x,
    );
    const host = makeHost(group, new EventTarget() as HTMLElement, target);
    const onTarget = new THREE.Ray(new THREE.Vector3(0.25, 0, 1), new THREE.Vector3(0, 0, -1));
    const outside = new THREE.Ray(new THREE.Vector3(1.25, 0, 1), new THREE.Vector3(0, 0, -1));

    expect(host.handleRay(onTarget, "down", "controller:slider", "controller")).toBe(true);
    expect(host.handleRay(outside, "move", "controller:slider", "controller")).toBe(true);
    expect(host.handleRay(outside, "up", "controller:slider", "controller")).toBe(true);

    expect(events.filter(({ type }) => type === "down" || type === "drag" || type === "up")
      .map(({ type, value }) => [type, value])).toEqual([
      ["down", 0.25],
      ["drag", 1.25],
      ["up", 1.25],
    ]);
    expect(events.some(({ type }) => type === "click")).toBe(false);
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("routes 3D particle swatch drags through the existing spatial input vocabulary", () => {
    const group = new THREE.Group();
    const { target, object3d } = makePointerTarget(
      group,
      vi.fn(),
      undefined,
      "particle:token:proton",
    );
    const dispatch = vi.fn();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    const host = createSpatialPanelHost({
      group,
      camera,
      pointerTarget: new EventTarget() as HTMLElement,
      panels: [],
      pointerTargets: [target],
      onPanelAction: vi.fn(),
      onSpatialInput: dispatch,
      enablePointerEvents: false,
    });
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));

    host.handleRay(ray, "down", "controller:proton", "controller");
    host.handleRay(ray, "move", "controller:proton", "controller");
    host.handleRay(ray, "up", "controller:proton", "controller");

    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual(["grab", "move", "release"]);
    expect(dispatch.mock.calls.every(([action]) => (
      action.payload.source === "tray:proton" &&
      action.payload.spatialParticleDrag === true
    ))).toBe(true);
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });

  it("forwards model gesture mode and paired zoom deltas through the shared target path", () => {
    const group = new THREE.Group();
    const events: SpatialPointerEvent[] = [];
    const { target, object3d } = makePointerTarget(group, (event) => events.push(event));
    const host = makeHost(group, new EventTarget() as HTMLElement, target);
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));

    host.handleRay(ray, "down", "controller:grip", "controller", "pan");
    host.handleRay(ray, "move", "controller:grip", "controller", "pan", 0.25);

    expect(events.at(-1)).toMatchObject({
      type: "drag",
      gestureMode: "pan",
      zoomDelta: 0.25,
    });
    host.handleRay(ray, "cancel", "controller:grip", "controller", "pan");
    host.dispose();
    object3d.geometry.dispose();
    (object3d.material as THREE.Material).dispose();
  });
});
