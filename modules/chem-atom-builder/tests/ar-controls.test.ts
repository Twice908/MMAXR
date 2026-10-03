import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleComfortBreakReminder } from "../src/ar-controls.js";

describe("AR comfort break reminders", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after ten minutes", () => {
    const reminder = vi.fn();
    scheduleComfortBreakReminder(reminder);

    vi.advanceTimersByTime(10 * 60 * 1000);
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(reminder).toHaveBeenCalledOnce();
  });

  it("does not fire after the AR session ends", () => {
    const reminder = vi.fn();
    const cancel = scheduleComfortBreakReminder(reminder);

    cancel();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(reminder).not.toHaveBeenCalled();
  });
});
