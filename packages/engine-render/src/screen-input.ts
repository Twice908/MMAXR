import type { EngineAction } from "@mma/engine-core";
import { InputManager } from "@mma/engine-input";
import * as THREE from "three";

/** Configuration for translating browser pointer events into engine actions. */
export interface ScreenInputOptions {
  readonly root: HTMLElement;
  readonly dispatch: (action: EngineAction) => void;
  readonly pickTarget: (
    clientX: number,
    clientY: number,
    source?: string,
    pointerType?: string,
  ) => string | null;
  readonly onDragEnd?: () => void;
}

/**
 * Adapt mouse, pen, and touch pointer events to the device-independent action
 * vocabulary. Modules receive actions and never inspect browser events.
 */
export class ScreenInputAdapter {
  private readonly manager: InputManager;
  private readonly dispatch: ScreenInputOptions["dispatch"];
  private readonly onDragEnd: (() => void) | undefined;

  /** Attach delegated screen input listeners to a module root. */
  constructor(options: ScreenInputOptions) {
    this.dispatch = options.dispatch;
    this.onDragEnd = options.onDragEnd;
    this.manager = new InputManager({
      renderer: {} as THREE.WebGLRenderer,
      root: options.root,
      dispatch: (action) => {
        if (action.type === "release") {
          this.onDragEnd?.();
        }
        this.dispatch(action as EngineAction);
      },
      pickScreenTarget: options.pickTarget,
      enableXrControllers: false,
      enableXrHands: false,
    });
  }

  /** Remove all browser listeners owned by this adapter. */
  dispose(): void {
    this.manager.dispose();
  }
}
