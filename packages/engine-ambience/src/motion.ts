/** Maps progress from 0 to 1 onto an eased progress from 0 to 1. */
export type Easing = (t: number) => number;

/** Clamp a number into the range 0 to 1. */
export function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Easing curves tuned for camera and UI motion. */
export const ease = {
  linear: (t: number) => clamp01(t),
  inCubic: (t: number) => clamp01(t) ** 3,
  outCubic: (t: number) => 1 - (1 - clamp01(t)) ** 3,
  inOutCubic: (t: number) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2,
  outExpo: (t: number) => {
    const x = clamp01(t);
    return x === 1 ? 1 : 1 - 2 ** (-10 * x);
  },
  inExpo: (t: number) => {
    const x = clamp01(t);
    return x === 0 ? 0 : 2 ** (10 * x - 10);
  },
} satisfies Record<string, Easing>;

/**
 * Move `current` towards `target` at a rate that does not depend on the frame rate.
 * `lambda` is the speed: about 4 feels soft, 12 feels snappy.
 */
export function damp(current: number, target: number, lambda: number, dtSeconds: number): number {
  return target + (current - target) * Math.exp(-lambda * Math.max(0, dtSeconds));
}

/** Blend between two scales so a zoom looks steady to the eye (log-space interpolation). */
export function zoomBetween(from: number, to: number, t: number): number {
  if (from <= 0 || to <= 0) return from + (to - from) * t;
  return from * (to / from) ** t;
}

/** A running animation. */
export interface Tween {
  /** Resolves when the tween finishes or is cancelled. */
  readonly done: Promise<void>;
  /** Stop now. `onUpdate` is not called again; `done` resolves. */
  cancel(): void;
}

/** Options for {@link tween}. */
export interface TweenOptions {
  readonly durationMs: number;
  /** Called every frame with eased progress from 0 to 1, and once with 1 at the end. */
  readonly onUpdate: (progress: number) => void;
  readonly easing?: Easing;
  /** Clock in milliseconds. Defaults to `performance.now`. */
  readonly now?: () => number;
  /** Frame scheduler. Defaults to `requestAnimationFrame`. */
  readonly requestFrame?: (callback: () => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

/** Run `onUpdate` once per frame for `durationMs`. A zero or negative duration jumps straight to the end. */
export function tween(options: TweenOptions): Tween {
  const easing = options.easing ?? ease.linear;
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  let resolve: () => void = () => undefined;
  const done = new Promise<void>((settle) => {
    resolve = settle;
  });
  if (options.durationMs <= 0) {
    options.onUpdate(easing(1));
    resolve();
    return { done, cancel: () => undefined };
  }
  const start = now();
  let handle = 0;
  let finished = false;
  const step = (): void => {
    if (finished) return;
    const raw = (now() - start) / options.durationMs;
    if (raw >= 1) {
      finished = true;
      options.onUpdate(easing(1));
      resolve();
      return;
    }
    options.onUpdate(easing(raw));
    handle = requestFrame(step);
  };
  options.onUpdate(easing(0));
  handle = requestFrame(step);
  return {
    done,
    cancel() {
      if (finished) return;
      finished = true;
      cancelFrame(handle);
      resolve();
    },
  };
}

/** Wait for a number of milliseconds. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
