import { describe, expect, it, vi } from "vitest";
import { InputManager } from "../src/input-manager.js";
import { FakeDomElement, event, pointerEvent } from "./helpers/fake-dom.js";

describe("InputManager", () => {
  it("creates all default input adapters", () => {
    const root = new FakeDomElement();
    const dispatch = vi.fn();
    const manager = new InputManager({
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
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
    const dispatch = vi.fn();

    const manager = new InputManager({
      root: root as unknown as HTMLElement,
      dispatch,
      pickScreenTarget: () => "atom:1",
      enableMouse: false,
      enableTouch: true,
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



  it("disposes without leaking listeners", () => {
    const root = new FakeDomElement();
    const dispatch = vi.fn();

    const manager = new InputManager({
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
