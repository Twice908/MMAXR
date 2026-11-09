import { InputEventBus } from "./event-bus.js";
import { MouseInputAdapter, type MouseInputOptions } from "./mouse.js";
import { TouchInputAdapter, type TouchInputOptions } from "./touch.js";
import type { InputAction } from "./types.js";
import type { ScreenPickFunction } from "./pointer-base.js";

export interface InputManagerOptions {
  root: HTMLElement;
  dispatch: (action: InputAction) => void;
  pickScreenTarget: ScreenPickFunction;
  enableMouse?: boolean;
  enableTouch?: boolean;
  mouse?: Omit<MouseInputOptions, "root" | "dispatch" | "pickTarget" | "events">;
  touch?: Omit<TouchInputOptions, "root" | "dispatch" | "pickTarget" | "events">;
}

export class InputManager {
  readonly events = new InputEventBus();

  private readonly adapters: Array<{ update?: (delta?: number | XRFrame) => void; dispose: () => void }> = [];
  private readonly screenAdapters: Array<MouseInputAdapter | TouchInputAdapter> = [];
  private screenInputEnabled = true;

  constructor(options: InputManagerOptions) {
    if (options.enableMouse ?? true) {
      const adapter = new MouseInputAdapter({
        root: options.root,
        dispatch: options.dispatch,
        pickTarget: options.pickScreenTarget,
        events: this.events,
        ...(options.mouse ?? {}),
      });
      this.screenAdapters.push(adapter);
      this.adapters.push(adapter);
    }

    if (options.enableTouch ?? true) {
      const adapter = new TouchInputAdapter({
        root: options.root,
        dispatch: options.dispatch,
        pickTarget: options.pickScreenTarget,
        events: this.events,
        ...(options.touch ?? {}),
      });
      this.screenAdapters.push(adapter);
      this.adapters.push(adapter);
    }
  }

  on = this.events.on.bind(this.events);

  update(deltaSeconds = 0): void {
    for (const adapter of this.adapters) {
      adapter.update?.(deltaSeconds);
    }
  }

  /** Suspend mouse/touch input while immersive XR owns browser navigation. XR input lives in `XrInputRig`. */
  setScreenInputEnabled(enabled: boolean): void {
    if (this.screenInputEnabled === enabled) return;
    this.screenInputEnabled = enabled;
    for (const adapter of this.screenAdapters) adapter.setEnabled(enabled);
  }

  dispose(): void {
    for (const adapter of this.adapters) adapter.dispose();
    this.adapters.length = 0;
    this.screenAdapters.length = 0;
    this.events.clear();
  }
}
