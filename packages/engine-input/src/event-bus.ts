import type { InputEventMap } from "./types.js";

type Listener<T> = (event: T) => void;

export class InputEventBus {
  private readonly listeners = new Map<keyof InputEventMap, Set<Listener<unknown>>>();

  on<K extends keyof InputEventMap>(type: K, listener: Listener<InputEventMap[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<unknown>);
    return () => set?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof InputEventMap>(type: K, event: InputEventMap[K]): void {
    this.listeners.get(type)?.forEach((listener) => {
      (listener as Listener<InputEventMap[K]>)(event);
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}
