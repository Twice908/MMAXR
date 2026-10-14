import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ScreenInputAdapter } from "../src/screen-input.js";
import { createSpatialPanelHost } from "../src/visuals/spatial-panel-host.js";
import type { GlassPanel } from "../src/visuals/glass-panel.js";
import { installZoomControls, screenZoomConfig } from "../src/zoom-controls.js";

class FakeInputRoot extends EventTarget {
  readonly capturedPointers = new Set<number>();

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }
}

function inputEvent(type: string, values: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  vi.spyOn(event, "preventDefault");
  vi.spyOn(event, "stopPropagation");
  vi.spyOn(event, "stopImmediatePropagation");
  return event;
}

describe("browser input isolation during XR", () => {
  it("leaves pointer, mouse, and keyboard events alone while presenting and restores handlers afterward", () => {
    const root = new FakeInputRoot();
    const actions: unknown[] = [];
    const input = new ScreenInputAdapter({
      root: root as unknown as HTMLElement,
      dispatch: (action) => actions.push(action),
      pickTarget: () => "electron:1",
    });
    input.setEnabled(false);

    const events = [
      inputEvent("mousedown", { button: 0, clientX: 20, clientY: 30 }),
      inputEvent("mousemove", { clientX: 30, clientY: 40 }),
      inputEvent("mouseup", { button: 0, clientX: 30, clientY: 40 }),
      inputEvent("contextmenu"),
      inputEvent("pointerdown", {
        pointerId: 1, pointerType: "touch", clientX: 20, clientY: 30,
      }),
      inputEvent("pointermove", {
        pointerId: 1, pointerType: "touch", clientX: 30, clientY: 40,
      }),
      inputEvent("pointerup", {
        pointerId: 1, pointerType: "touch", clientX: 30, clientY: 40,
      }),
      inputEvent("pointercancel", {
        pointerId: 1, pointerType: "touch", clientX: 30, clientY: 40,
      }),
      inputEvent("keydown", { key: "w" }),
      inputEvent("keyup", { key: "w" }),
    ];
    for (const event of events) root.dispatchEvent(event);

    expect(actions).toEqual([]);
    expect(root.capturedPointers.size).toBe(0);
    for (const event of events) {
      expect(event.defaultPrevented).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    }

    input.setEnabled(true);
    const resumedMove = inputEvent("mousemove", { clientX: 35, clientY: 45 });
    const resumedContextMenu = inputEvent("contextmenu");
    root.dispatchEvent(resumedMove);
    root.dispatchEvent(resumedContextMenu);
    expect(actions).toHaveLength(1);
    expect(resumedContextMenu.defaultPrevented).toBe(true);
    input.dispose();
  });

  it("does not consume window wheel events while XR is active, then restores screen zoom", () => {
    const target = new EventTarget();
    let xrActive = true;
    let distance: number = screenZoomConfig.defaultDistance;
    const canvas = {
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 400, bottom: 800,
      }),
    } as HTMLCanvasElement;
    const dispose = installZoomControls(
      canvas,
      () => distance,
      (next) => { distance = next; },
      screenZoomConfig,
      () => !xrActive,
      target as Pick<Window, "addEventListener" | "removeEventListener">,
    );

    const wheelWhilePresenting = inputEvent("wheel", {
      ctrlKey: true, deltaY: -120, deltaMode: 0, clientX: 200, clientY: 300,
    });
    target.dispatchEvent(wheelWhilePresenting);
    expect(wheelWhilePresenting.defaultPrevented).toBe(false);
    expect(wheelWhilePresenting.preventDefault).not.toHaveBeenCalled();
    expect(distance).toBe(screenZoomConfig.defaultDistance);
    const windowEvents = [
      inputEvent("pointerdown", { pointerId: 2, pointerType: "mouse" }),
      inputEvent("pointermove", { pointerId: 2, pointerType: "mouse" }),
      inputEvent("pointerup", { pointerId: 2, pointerType: "mouse" }),
      inputEvent("mousedown", { button: 0 }),
      inputEvent("mousemove"),
      inputEvent("mouseup", { button: 0 }),
      inputEvent("keydown", { key: "w" }),
      inputEvent("keyup", { key: "w" }),
    ];
    for (const event of windowEvents) {
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    }
    expect(wheelWhilePresenting.stopPropagation).not.toHaveBeenCalled();
    expect(wheelWhilePresenting.stopImmediatePropagation).not.toHaveBeenCalled();

    xrActive = false;
    const wheelAfterExit = inputEvent("wheel", {
      ctrlKey: false, deltaY: -120, deltaMode: 0, clientX: 200, clientY: 300,
    });
    target.dispatchEvent(wheelAfterExit);
    expect(wheelAfterExit.defaultPrevented).toBe(true);
    expect(distance).toBeLessThan(screenZoomConfig.defaultDistance);
    dispose();
  });

  it("keeps XR ray-panel input while omitting spatial host pointer interception", () => {
    const target = new FakeInputRoot();
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial();
    const panel = {
      object3d: new THREE.Mesh(geometry, material),
      update: vi.fn(),
      hitTest: vi.fn(() => null),
      setCollapsed: vi.fn(),
      setPage: vi.fn(),
      setScale: vi.fn(),
      dispose: vi.fn(() => {
        geometry.dispose();
        material.dispose();
      }),
    } satisfies GlassPanel;
    const addListener = vi.spyOn(target, "addEventListener");
    const host = createSpatialPanelHost({
      group: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(),
      pointerTarget: target as unknown as HTMLElement,
      panels: [{ panel }],
      onPanelAction: vi.fn(),
      enablePointerEvents: false,
    });

    expect(addListener).not.toHaveBeenCalled();
    const removeListener = vi.spyOn(target, "removeEventListener");
    host.setPointerEventsEnabled(true);
    expect(addListener).toHaveBeenCalledTimes(4);
    host.setPointerEventsEnabled(false);
    expect(removeListener).toHaveBeenCalledTimes(4);
    host.handleRay(new THREE.Ray(), "move");
    expect(panel.hitTest).toHaveBeenCalledOnce();
    host.setPointerEventsEnabled(true);
    host.dispose();
    expect(removeListener).toHaveBeenCalledTimes(8);
    expect(panel.dispose).toHaveBeenCalledOnce();
  });

  it("hides and disables fixed DOM overlays during VR so none can intercept canvas input", () => {
    const css = readFileSync(
      new URL("../../../modules/chem-atom-builder/src/atom-builder.css", import.meta.url),
      "utf8",
    );
    const rule = css.match(/\.xr-vr-active \.ar-overlay-panel,[\s\S]*?\n\}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toContain("display: none !important");
    expect(rule).toContain("pointer-events: none !important");
    for (const selector of [
      ".ar-exit",
      ".ar-confirmation",
      ".spatial-settings-fallback",
      ".dom-settings-scrim",
      ".dom-settings-sheet",
      ".camera-view-panel",
      ".camera-view-exit",
      ".ar-diagnostics",
      ".dev-event-panel",
    ]) {
      expect(rule).toContain(`.xr-vr-active ${selector}`);
    }
    expect(css).toContain(".xr-vr-active * { pointer-events: none !important; }");
    expect(css).toContain(".xr-vr-active .atom-canvas { pointer-events: auto !important; }");
    expect(css).toContain(".xr-session-active .scene-viewport,\n.xr-session-active .atom-canvas { touch-action: auto !important; }");
  });
});
