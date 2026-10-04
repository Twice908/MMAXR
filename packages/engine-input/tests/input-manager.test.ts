import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { InputManager } from "../src/input-manager.ts";
import { FakeDomElement, event, pointerEvent } from "./helpers/fake-dom.js";
import { makeFakeRenderer } from "./helpers/fake-xr.js";

describe("InputManager", () => {
  it("creates all default input adapters", () => {
    const root = new FakeDomElement();
    const renderer = makeFakeRenderer();
    const dispatch = vi.fn();
    const manager = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
      pickWorldRay: () => ({ target: "atom:1" }),
    });

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 10,
      clientY: 20,
    }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "select" }),
    );

    manager.dispose();
  });

  it("can disable individual adapters", () => {
    const root = new FakeDomElement();
    const renderer = makeFakeRenderer();
    const dispatch = vi.fn();

    const manager = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
      enableMouse: false,
      enableTouch: true,
      enableXrControllers: false,
      enableXrHands: false,
    });

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 1,
      clientY: 1,
    }));

    expect(dispatch).not.toHaveBeenCalled();

    root.dispatchEvent(pointerEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 1,
      clientY: 1,
    }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "select" }),
    );

    manager.dispose();
  });

  it("forwards XR frames to hand input", () => {
    const root = new FakeDomElement();
    const renderer = makeFakeRenderer({
      inputSources: [],
    });
    const dispatch = vi.fn();

    const manager = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => null,
      enableMouse: false,
      enableTouch: false,
      enableXrControllers: false,
      enableXrHands: true,
    });

    expect(() => manager.updateXrFrame({
      getJointPose: () => null,
    } as any)).not.toThrow();

    manager.dispose();
  });

  it("exposes controller spaces when XR controllers are enabled", () => {
    const root = new FakeDomElement();
    const renderer = makeFakeRenderer();
    const manager = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch: vi.fn(),
      pickScreenTarget: () => null,
      enableMouse: false,
      enableTouch: false,
      enableXrHands: false,
    });

    expect(manager.getXrController(0)).toBeInstanceOf(THREE.Group);
    expect(manager.getXrControllerGrip(0)).toBeInstanceOf(THREE.Group);

    manager.dispose();
  });

  it("disposes without leaking listeners", () => {
    const root = new FakeDomElement();
    const renderer = makeFakeRenderer();
    const dispatch = vi.fn();

    const manager = new InputManager({
      renderer,
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
    });

    manager.dispose();

    root.dispatchEvent(event("mousedown", {
      button: 0,
      clientX: 1,
      clientY: 1,
    }));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
