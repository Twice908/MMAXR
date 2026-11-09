/**
 * Pure helpers for reading WebXR gamepads. Nothing here touches the DOM, three.js
 * or an XR session, so the mapping rules can be unit-tested without a headset.
 */

/**
 * Button indices of the `xr-standard` gamepad mapping, as used by Meta Quest
 * Touch controllers. Meta's Touch Pro page confirms buttons 0-5 follow this
 * mapping and that button 6 is the thumb rest; the index order below is the W3C
 * mapping and still needs one on-device confirmation (see docs/xr-device-testing.md).
 */
export const XR_STANDARD_BUTTON = {
  trigger: 0,
  squeeze: 1,
  touchpad: 2,
  thumbstick: 3,
  primary: 4,
  secondary: 5,
  thumbrest: 6,
} as const;

/** Analog value at which a button counts as pressed when the browser reports `pressed: false`. */
export const XR_PRESS_VALUE = 0.75;
/** Analog value below which a held button counts as released (hysteresis). */
export const XR_RELEASE_VALUE = 0.5;
/** Thumbstick radius below which the stick reads as centred. */
export const XR_THUMBSTICK_DEADZONE = 0.15;

/** The subset of `Gamepad` this module reads. */
export interface GamepadLike {
  readonly buttons: ArrayLike<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ArrayLike<number>;
}

/** Two-axis thumbstick reading. Follows the Gamepad convention: positive y is down. */
export interface ThumbstickReading {
  readonly x: number;
  readonly y: number;
}

/**
 * Read one button with hysteresis. A missing button reads as released.
 * `wasDown` is the previous result, so analog triggers do not flicker near the threshold.
 */
export function readButton(
  gamepad: GamepadLike | null | undefined,
  index: number,
  wasDown: boolean,
): boolean {
  const button = gamepad?.buttons[index];
  if (!button) return false;
  if (button.pressed) return true;
  return wasDown ? button.value > XR_RELEASE_VALUE : button.value >= XR_PRESS_VALUE;
}

/**
 * Read the thumbstick with a radial deadzone, rescaled so the output starts at
 * zero just outside the deadzone. Uses axes 2-3 (xr-standard thumbstick) and
 * falls back to axes 0-1 for pads that only report one stick.
 */
export function readThumbstick(gamepad: GamepadLike | null | undefined): ThumbstickReading {
  if (!gamepad) return { x: 0, y: 0 };
  const axes = gamepad.axes;
  let x = 0;
  let y = 0;
  if (axes.length >= 4) {
    x = axes[2] ?? 0;
    y = axes[3] ?? 0;
  } else if (axes.length >= 2) {
    x = axes[0] ?? 0;
    y = axes[1] ?? 0;
  }
  const magnitude = Math.hypot(x, y);
  if (magnitude <= XR_THUMBSTICK_DEADZONE) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - XR_THUMBSTICK_DEADZONE) / (1 - XR_THUMBSTICK_DEADZONE));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

/** Result of polling an edge channel. */
export type Edge = "down" | "up" | null;

/**
 * Turns a polled boolean level into press/release edges. Events and polling can
 * both feed the same source; a channel only reports changes in its own level.
 */
export class EdgeChannel {
  private level = false;

  /** The last level passed to {@link poll}. */
  get isDown(): boolean {
    return this.level;
  }

  /** Report `down` or `up` only when `next` differs from the previous poll. */
  poll(next: boolean): Edge {
    if (next === this.level) return null;
    this.level = next;
    return next ? "down" : "up";
  }

  /** Forget the previous level without reporting an edge. */
  reset(): void {
    this.level = false;
  }
}
