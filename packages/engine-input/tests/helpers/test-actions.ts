import { vi } from "vitest";
import type { InputAction } from "../../src/types.js";

export function createActionSink() {
  const actions: InputAction[] = [];
  const dispatch = vi.fn((action: InputAction) => {
    actions.push(action);
  });

  return {
    actions,
    dispatch,
  };
}
