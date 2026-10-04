import { vi } from "vitest";
import type { JsonValue } from "@mma/engine-core";
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

export function payloadValue(action: InputAction | undefined, key: string): JsonValue | undefined {
  const payload = action?.payload;
  if (!isJsonRecord(payload)) return undefined;
  return payload[key];
}

export function payloadNumber(action: InputAction | undefined, key: string): number | undefined {
  const value = payloadValue(action, key);
  return typeof value === "number" ? value : undefined;
}

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
