import type { InputAction, InputEventMap } from "./types.js";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";

export type ScreenPickFunction = (
  clientX: number,
  clientY: number,
  source?: string,
  pointerType?: string,
) => string | null;

export interface PointerAdapterOptions {
  root: HTMLElement;
  pickTarget: ScreenPickFunction;
  dispatch: (action: InputAction) => void;
  events?: InputEventBus;
}

export abstract class PointerAdapterBase {
  protected readonly root: HTMLElement;
  protected readonly pickTarget: PointerAdapterOptions["pickTarget"];
  protected readonly events!: InputEventBus;
  protected readonly dispatcher!: ActionDispatcher;

  protected constructor(options: PointerAdapterOptions) {
    this.root = options.root;
    this.pickTarget = options.pickTarget;
    this.events = options.events ?? new InputEventBus();
    this.dispatcher = new ActionDispatcher(options.dispatch, this.events);
  }

  on<K extends keyof InputEventMap>(
    type: K,
    listener: (event: InputEventMap[K]) => void,
  ): () => void {
    return this.events.on(type, listener);
  }

  /**
   * Resolve the tray particle a pointer gesture started on. Pickers use the
   * `tray:<particle>` source to apply particle-specific snapping, so it is
   * captured once at gesture start and reused for every later pick.
   */
  protected traySourceFor(target: EventTarget | null): string | null {
    const candidate = target as { closest?: (selector: string) => { dataset?: { particle?: string } } | null } | null;
    if (typeof candidate?.closest !== "function") return null;
    const particle = candidate.closest("[data-particle]")?.dataset?.particle;
    return typeof particle === "string" && particle.length > 0 ? `tray:${particle}` : null;
  }

  dispose(): void {
    // The event bus may be shared by InputManager and other adapters.
    // Its lifecycle belongs to the owner that created it, not to an adapter.
  }
}
