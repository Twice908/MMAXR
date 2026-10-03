import type { InputAction } from "./types.js";
import { ActionDispatcher } from "./action-dispatcher.js";
import { InputEventBus } from "./event-bus.js";

export interface PointerAdapterOptions {
  root: HTMLElement;
  pickTarget: (clientX: number, clientY: number) => string | null;
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

  on = this.events.on.bind(this.events);

  dispose(): void {
    this.events.clear();
  }
}
