import type { InputAction, InputActionDispatcher } from "./types.js";
import { InputEventBus } from "./event-bus.js";

export class ActionDispatcher {
  constructor(
    private readonly dispatch: InputActionDispatcher,
    private readonly events: InputEventBus,
  ) {}

  emit(action: InputAction): void {
    this.dispatch(action);
    this.events.emit("action", action);
  }
}
