export class FakeDomElement extends EventTarget {
  readonly capturedPointers = new Set<number>();
  readonly releasedPointers = new Set<number>();

  width = 800;
  height = 600;
  left = 0;
  top = 0;

  getBoundingClientRect() {
    return {
      left: this.left,
      top: this.top,
      width: this.width,
      height: this.height,
      right: this.left + this.width,
      bottom: this.top + this.height,
      x: this.left,
      y: this.top,
      toJSON: () => ({}),
    };
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
    this.releasedPointers.add(pointerId);
  }
}

export function event(type: string, init: Record<string, unknown> = {}): Event & Record<string, unknown> {
  const value = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(value, init);
  return value;
}

export function pointerEvent(
  type: string,
  init: {
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
    button?: number;
  },
): Event & Record<string, unknown> {
  return event(type, init);
}
