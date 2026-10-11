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

// Minimal WheelEvent polyfill for Node.js test environment.
class MockWheelEvent extends Event {
  static readonly DOM_DELTA_PIXEL = 0;
  static readonly DOM_DELTA_LINE = 1;
  static readonly DOM_DELTA_PAGE = 2;

  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;

  constructor(type: string, init: {
    bubbles?: boolean;
    cancelable?: boolean;
    deltaY?: number;
    deltaMode?: number;
    ctrlKey?: boolean;
  } = {}) {
    super(type, { bubbles: init.bubbles ?? true, cancelable: init.cancelable ?? true });
    this.deltaY = init.deltaY ?? 0;
    this.deltaMode = init.deltaMode ?? MockWheelEvent.DOM_DELTA_PIXEL;
    this.ctrlKey = init.ctrlKey ?? false;
  }
}

// Use global WheelEvent if available (browser), otherwise use mock.
const WheelEventCtor = (typeof globalThis.WheelEvent !== "undefined")
  ? globalThis.WheelEvent
  : MockWheelEvent;

export function event(type: string, init: Record<string, unknown> = {}): Event & Record<string, unknown> {
  const value = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(value, init);
  return value;
}

export function wheelEvent(init: {
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
} = { deltaY: 0 }): WheelEvent & Record<string, unknown> {
  const value = new WheelEventCtor("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: init.deltaY,
    deltaMode: init.deltaMode ?? WheelEventCtor.DOM_DELTA_PIXEL,
    ctrlKey: init.ctrlKey ?? false,
  }) as WheelEvent & Record<string, unknown>;
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
