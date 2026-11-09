import { describe, expect, it } from "vitest";
import {
  EdgeChannel,
  XR_STANDARD_BUTTON,
  XR_THUMBSTICK_DEADZONE,
  readButton,
  readThumbstick,
} from "../src/xr-buttons.js";

const pad = (values: readonly number[], pressed: readonly number[] = []) => ({
  buttons: values.map((value, index) => ({ value, pressed: pressed.includes(index) })),
  axes: [] as number[],
});

describe("xr-standard button mapping", () => {
  it("uses the xr-standard indices for Quest Touch controllers", () => {
    expect(XR_STANDARD_BUTTON).toMatchObject({
      trigger: 0,
      squeeze: 1,
      thumbstick: 3,
      primary: 4,
      secondary: 5,
      thumbrest: 6,
    });
  });
});

describe("readButton", () => {
  it("treats a missing button or gamepad as released", () => {
    expect(readButton(null, 0, false)).toBe(false);
    expect(readButton(pad([]), 4, true)).toBe(false);
  });

  it("trusts the browser's pressed flag", () => {
    expect(readButton(pad([0.1], [0]), 0, false)).toBe(true);
  });

  it("applies hysteresis to analog values when pressed is false", () => {
    expect(readButton(pad([0.6]), 0, false)).toBe(false);
    expect(readButton(pad([0.8]), 0, false)).toBe(true);
    expect(readButton(pad([0.6]), 0, true)).toBe(true);
    expect(readButton(pad([0.4]), 0, true)).toBe(false);
  });
});

describe("readThumbstick", () => {
  it("reads axes 2 and 3 and zeroes the deadzone", () => {
    expect(readThumbstick({ buttons: [], axes: [0, 0, 0.1, -0.1] })).toEqual({ x: 0, y: 0 });
    const reading = readThumbstick({ buttons: [], axes: [0, 0, 1, 0] });
    expect(reading.x).toBeCloseTo(1);
    expect(reading.y).toBeCloseTo(0);
  });

  it("rescales so output starts at zero past the deadzone and keeps direction", () => {
    const edge = XR_THUMBSTICK_DEADZONE + 0.01;
    const reading = readThumbstick({ buttons: [], axes: [0, 0, 0, -edge] });
    expect(reading.x).toBeCloseTo(0);
    expect(reading.y).toBeLessThan(0);
    expect(Math.abs(reading.y)).toBeLessThan(0.05);
  });

  it("falls back to axes 0 and 1 for a pad with one stick", () => {
    const reading = readThumbstick({ buttons: [], axes: [0.9, 0] });
    expect(reading.x).toBeGreaterThan(0.8);
  });

  it("never exceeds unit length", () => {
    const reading = readThumbstick({ buttons: [], axes: [0, 0, 1, 1] });
    expect(Math.hypot(reading.x, reading.y)).toBeLessThanOrEqual(1.0001);
  });
});

describe("EdgeChannel", () => {
  it("reports only changes in level", () => {
    const channel = new EdgeChannel();
    expect(channel.poll(false)).toBeNull();
    expect(channel.poll(true)).toBe("down");
    expect(channel.poll(true)).toBeNull();
    expect(channel.isDown).toBe(true);
    expect(channel.poll(false)).toBe("up");
    expect(channel.poll(false)).toBeNull();
  });

  it("reset forgets the level without an edge", () => {
    const channel = new EdgeChannel();
    channel.poll(true);
    channel.reset();
    expect(channel.isDown).toBe(false);
    expect(channel.poll(true)).toBe("down");
  });
});
