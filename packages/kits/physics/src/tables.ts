import type { BulbCurve } from "./components.js";

/** Resistor values offered on the bench, in ohms. */
export const STANDARD_RESISTOR_OHMS: readonly number[] = [2, 5, 10];

/**
 * A small 6 V filament bulb. As the filament heats up its resistance rises, from about
 * 3 Ω cold to 20 Ω at 6 V, so its V–I graph curves instead of being a straight line.
 *
 * The values are illustrative and await the teacher's review.
 */
export const STANDARD_BULB_CURVE: BulbCurve = {
  id: "bulb-6v",
  ratedVolts: 6,
  reviewStatus: "pending",
  points: [
    { volts: 0, amps: 0 },
    { volts: 0.25, amps: 0.08 },
    { volts: 0.5, amps: 0.12 },
    { volts: 1, amps: 0.16 },
    { volts: 1.5, amps: 0.19 },
    { volts: 3, amps: 0.25 },
    { volts: 4.5, amps: 0.28 },
    { volts: 6, amps: 0.3 },
  ],
};
