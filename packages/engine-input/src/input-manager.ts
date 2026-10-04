import * as THREE from "three";
import { InputEventBus } from "./event-bus.js";
import { MouseInputAdapter, type MouseInputOptions } from "./mouse.js";
import { TouchInputAdapter, type TouchInputOptions } from "./touch.js";
import { XrControllerInputAdapter, type XrControllerInputOptions } from "./xr-controller.js";
import { XrHandInputAdapter, type XrHandInputOptions } from "./xr-hand.js";
import type { InputAction, PickFunction } from "./types.js";
import type { ScreenPickFunction } from "./pointer-base.js";

export interface InputManagerOptions {
  renderer: THREE.WebGLRenderer;
  root: HTMLElement;
  dispatch: (action: InputAction) => void;
  pickScreenTarget: ScreenPickFunction;
  pickWorldRay?: PickFunction;
  enableMouse?: boolean;
  enableTouch?: boolean;
  enableXrControllers?: boolean;
  enableXrHands?: boolean;
  mouse?: Omit<MouseInputOptions, "root" | "dispatch" | "pickTarget" | "events">;
  touch?: Omit<TouchInputOptions, "root" | "dispatch" | "pickTarget" | "events">;
  xrController?: Omit<XrControllerInputOptions, "renderer" | "dispatch" | "pick" | "events">;
  xrHand?: Omit<XrHandInputOptions, "renderer" | "dispatch" | "pick" | "events">;
}

export class InputManager {
  readonly events = new InputEventBus();

  private readonly adapters: Array<{ update?: (delta?: number | XRFrame) => void; dispose: () => void }> = [];
  private readonly xrController?: XrControllerInputAdapter;
  private readonly xrHand?: XrHandInputAdapter;

  constructor(options: InputManagerOptions) {
    if (options.enableMouse ?? true) {
      this.adapters.push(new MouseInputAdapter({
        root: options.root,
        dispatch: options.dispatch,
        pickTarget: options.pickScreenTarget,
        events: this.events,
        ...(options.mouse ?? {}),
      }));
    }

    if (options.enableTouch ?? true) {
      this.adapters.push(new TouchInputAdapter({
        root: options.root,
        dispatch: options.dispatch,
        pickTarget: options.pickScreenTarget,
        events: this.events,
        ...(options.touch ?? {}),
      }));
    }

    if (options.enableXrControllers ?? true) {
      this.xrController = new XrControllerInputAdapter({
        renderer: options.renderer,
        dispatch: options.dispatch,
        ...(options.pickWorldRay ? { pick: options.pickWorldRay } : {}),
        events: this.events,
        ...(options.xrController ?? {}),
      });
      this.adapters.push(this.xrController);
    }

    if (options.enableXrHands ?? true) {
      this.xrHand = new XrHandInputAdapter({
        renderer: options.renderer,
        dispatch: options.dispatch,
        ...(options.pickWorldRay ? { pick: options.pickWorldRay } : {}),
        events: this.events,
        ...(options.xrHand ?? {}),
      });
      this.adapters.push(this.xrHand);
    }
  }

  on = this.events.on.bind(this.events);

  update(deltaSeconds = 0): void {
    for (const adapter of this.adapters) {
      adapter.update?.(deltaSeconds);
    }
  }

  getXrController(index: number): THREE.Group | null {
    return this.xrController?.getController(index) ?? null;
  }

  getXrControllerGrip(index: number): THREE.Group | null {
    return this.xrController?.getControllerGrip(index) ?? null;
  }

  updateXrFrame(frame: XRFrame): void {
    this.xrHand?.update(frame);
    this.xrController?.update();
  }

  dispose(): void {
    for (const adapter of this.adapters) adapter.dispose();
    this.adapters.length = 0;
    this.events.clear();
  }
}
