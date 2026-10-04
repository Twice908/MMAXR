import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  InputManager,
  createRaycastPicker,
  createScreenRayPicker,
} from "../src/index.js";
import { FakeDomElement, event, pointerEvent } from "./helpers/fake-dom.js";
import { asWebGLRenderer, makeFakeRenderer } from "./helpers/fake-xr.js";

describe("engine-input integration", () => {
  it("routes mouse and touch through one EngineAction stream", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 3;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const object = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    object.userData.inputId = "atom:1";
    scene.add(object);

    const root = new FakeDomElement();
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const dispatch = vi.fn();

    const input = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: createScreenRayPicker(
        camera,
        scene,
        root as unknown as HTMLElement,
      ),
      pickWorldRay: createRaycastPicker(scene),
      enableXrControllers: false,
      enableXrHands: false,
    });

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 400,
      clientY: 300,
    }));
    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 400,
      clientY: 300,
    }));

    expect(dispatch).toHaveBeenCalled();
    const types = dispatch.mock.calls.map(([action]) => action.type);
    expect(types).toContain("select");

    input.dispose();
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  });

  it("keeps the public action vocabulary device-independent", () => {
    const root = new FakeDomElement();
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const dispatch = vi.fn();

    const input = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
      enableXrControllers: false,
      enableXrHands: false,
    });

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 10,
      clientY: 10,
    }));
    root.dispatchEvent(event("mouseup", {
      button: 0,
      clientX: 10,
      clientY: 10,
    }));

    const types = dispatch.mock.calls.map(([action]) => action.type);
    expect(types.every((type) =>
      ["hover", "select", "grab", "move", "release", "rotate", "scale", "confirm", "back"].includes(type)
    )).toBe(true);

    input.dispose();
  });

  it("does not create duplicate listeners after repeated updates", () => {
    const root = new FakeDomElement();
    const renderer = asWebGLRenderer(makeFakeRenderer());
    const dispatch = vi.fn();

    const input = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
      enableXrControllers: false,
      enableXrHands: false,
    });

    input.update();
    input.update();
    input.update();

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 1,
      clientY: 1,
    }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    input.dispose();
  });
});
