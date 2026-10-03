import * as THREE from "three";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";
import type { InputAction, PickFunction, Handedness, InputAdapter } from "./types.js";

export interface XrControllerInputOptions {
  renderer: THREE.WebGLRenderer;
  dispatch: (action: InputAction) => void;
  pick?: PickFunction;
  events?: InputEventBus;
  controllerCount?: number;
  rayLength?: number;
  selectButton?: "select" | "squeeze";
}

interface ControllerState {
  index: number;
  handedness: Handedness;
  controller: THREE.Group;
  grip: THREE.Group;
  target: string | null;
  grabbing: boolean;
}

export class XrControllerInputAdapter implements InputAdapter {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly dispatch: ActionDispatcher;
  private readonly events!: InputEventBus;
  private readonly pick: PickFunction | undefined;
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayLength: number;
  private readonly selectButton: "select" | "squeeze";
  private readonly controllers: ControllerState[] = [];
  private readonly unsubscribers: (() => void)[] = [];
  private disposed = false;

  constructor(options: XrControllerInputOptions) {
    this.renderer = options.renderer;
    this.events = options.events ?? new InputEventBus();
    this.dispatch = new ActionDispatcher(options.dispatch, this.events);
    this.pick = options.pick;
    this.rayLength = options.rayLength ?? 10;
    this.selectButton = options.selectButton ?? "select";

    const count = Math.max(1, options.controllerCount ?? 2);
    for (let index = 0; index < count; index++) this.addController(index);
  }

  on = this.events.on.bind(this.events);

  update(): void {
    if (this.disposed) return;
    for (const state of this.controllers) {
      this.updateControllerTarget(state);
    }
  }

  getController(index: number): THREE.Group {
    return this.renderer.xr.getController(index);
  }

  getControllerGrip(index: number): THREE.Group {
    return this.renderer.xr.getControllerGrip(index);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.controllers.length = 0;
  }

  private addController(index: number): void {
    const controller = this.renderer.xr.getController(index);
    const grip = this.renderer.xr.getControllerGrip(index);
    const state: ControllerState = {
      index,
      handedness: "none",
      controller,
      grip,
      target: null,
      grabbing: false,
    };
    this.controllers.push(state);

    const onSelectStart = () => this.beginSelect(state);
    const onSelectEnd = () => this.endSelect(state);
    const onSqueezeStart = () => this.beginSqueeze(state);
    const onSqueezeEnd = () => this.endSqueeze(state);
    const onConnected = (event: THREE.Event & { data?: XRInputSource }) => {
      const source = event.data;
      state.handedness = source?.handedness === "left" || source?.handedness === "right"
        ? source.handedness
        : "none";
      this.events.emit("sourceAdded", {
        source: "xr-controller",
        id: `controller-${index}`,
      });
    };
    const onDisconnected = () => {
      if (state.grabbing) this.release(state, true);
      state.target = null;
      state.handedness = "none";
      this.events.emit("sourceRemoved", {
        source: "xr-controller",
        id: `controller-${index}`,
      });
    };

    controller.addEventListener("selectstart", onSelectStart);
    controller.addEventListener("selectend", onSelectEnd);
    controller.addEventListener("squeezestart", onSqueezeStart);
    controller.addEventListener("squeezeend", onSqueezeEnd);
    controller.addEventListener("connected", onConnected);
    controller.addEventListener("disconnected", onDisconnected);

    this.unsubscribers.push(() => {
      controller.removeEventListener("selectstart", onSelectStart);
      controller.removeEventListener("selectend", onSelectEnd);
      controller.removeEventListener("squeezestart", onSqueezeStart);
      controller.removeEventListener("squeezeend", onSqueezeEnd);
      controller.removeEventListener("connected", onConnected);
      controller.removeEventListener("disconnected", onDisconnected);
    });
  }

  private updateControllerTarget(state: ControllerState): void {
    if (!this.pick) return;

    this.raycaster.setFromXRController(
      state.controller as Parameters<typeof this.raycaster.setFromXRController>[0],
    );
    this.raycaster.far = this.rayLength;

    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    state.controller.getWorldPosition(origin);
    state.controller.getWorldDirection(direction);

    const result = this.pick({
      origin,
      direction,
      source: "xr-controller",
      handedness: state.handedness,
    });

    state.target = result?.target ?? null;

    if (state.target) {
      this.dispatch.emit({
        type: "hover",
        payload: {
          source: "xr-controller",
          controller: state.index,
          handedness: state.handedness,
          target: state.target,
        },
      });
    }
  }

  private beginSelect(state: ControllerState): void {
    if (this.selectButton !== "select") return;
    const target = state.target;
    if (!target) return;

    state.grabbing = true;
    this.dispatch.emit({
      type: "grab",
      payload: {
        source: "xr-controller",
        controller: state.index,
        handedness: state.handedness,
        target,
      },
    });
  }

  private endSelect(state: ControllerState): void {
    if (this.selectButton !== "select") return;
    this.release(state, false);
  }

  private beginSqueeze(state: ControllerState): void {
    if (this.selectButton !== "squeeze") return;
    const target = state.target;
    if (!target) return;
    state.grabbing = true;
    this.dispatch.emit({
      type: "grab",
      payload: {
        source: "xr-controller",
        controller: state.index,
        handedness: state.handedness,
        target,
      },
    });
  }

  private endSqueeze(state: ControllerState): void {
    if (this.selectButton !== "squeeze") return;
    this.release(state, false);
  }

  private release(state: ControllerState, cancelled: boolean): void {
    if (!state.grabbing) return;
    this.dispatch.emit({
      type: "release",
      payload: {
        source: "xr-controller",
        controller: state.index,
        handedness: state.handedness,
        target: state.target,
        cancelled,
      },
    });
    state.grabbing = false;
  }
}
