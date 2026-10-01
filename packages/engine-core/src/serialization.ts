import type { JsonValue } from "./actions.js";

/** Throws when a value is not plain JSON data. */
export function assertJsonSerializable(
  value: unknown,
  label: string,
): asserts value is JsonValue {
  const ancestors = new WeakSet<object>();

  const visit = (current: unknown, path: string): void => {
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      return;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError(`${label}${path} must contain only finite numbers`);
      }
      return;
    }

    if (typeof current !== "object") {
      throw new TypeError(`${label}${path} is not JSON-serializable`);
    }

    if (ancestors.has(current)) {
      throw new TypeError(`${label}${path} contains a circular reference`);
    }
    ancestors.add(current);

    if (Array.isArray(current)) {
      const keys = Reflect.ownKeys(current).filter((key) => key !== "length");
      if (keys.some((key) => typeof key !== "string" || !/^\d+$/.test(key))) {
        throw new TypeError(`${label}${path} contains non-JSON array properties`);
      }
      for (let index = 0; index < current.length; index += 1) {
        if (!(index in current)) {
          throw new TypeError(`${label}${path}[${index}] is missing`);
        }
        visit(current[index], `${path}[${index}]`);
      }
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${label}${path} must be a plain object`);
      }

      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") {
          throw new TypeError(`${label}${path} contains a symbol key`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${label}${path}.${key} must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}.${key}`);
      }
    }

    ancestors.delete(current);
  };

  visit(value, "");
}

/** Makes a validated value independent from its caller and safe to retain in an action log. */
export function cloneJson<T>(value: T, label: string): T {
  assertJsonSerializable(value, label);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(`${label} could not be serialized`);
  }
  return JSON.parse(serialized) as T;
}

/** Recursively freezes data without invoking property getters. */
export function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return value;
  }

  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value, visited);
    }
  }
  return Object.freeze(value);
}