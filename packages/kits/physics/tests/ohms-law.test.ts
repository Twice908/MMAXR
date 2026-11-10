import { describe, expect, it } from "vitest";
import {
  currentFrom,
  fitResistance,
  followsOhmsLaw,
  potentialDifferenceFrom,
  resistanceFrom,
  roundToResolution,
} from "../src/index.js";

describe("Ohm's law formulas", () => {
  // Teacher-checked values.
  it("finds I, V and R from the other two", () => {
    expect(currentFrom(3, 10)).toBeCloseTo(0.3, 12);
    expect(potentialDifferenceFrom(0.3, 10)).toBeCloseTo(3, 12);
    expect(resistanceFrom(4.5, 0.9)).toBeCloseTo(5, 12);
    expect(resistanceFrom(1.5, 0)).toBeNull();
  });
});

describe("meter rounding", () => {
  it("rounds to the meter's step without floating-point dust", () => {
    expect(roundToResolution(0.15000000000000002, 0.01)).toBe(0.15);
    expect(roundToResolution(0.2066, 0.01)).toBe(0.21);
    expect(roundToResolution(4.4999, 0.1)).toBe(4.5);
    expect(roundToResolution(-0.0001, 0.01)).toBe(0);
  });
});

describe("reading tables", () => {
  const resistorReadings = [
    { volts: 1.5, amps: 0.15 },
    { volts: 3, amps: 0.3 },
    { volts: 4.5, amps: 0.45 },
  ];
  const bulbReadings = [
    { volts: 1.5, amps: 0.19 },
    { volts: 3, amps: 0.25 },
    { volts: 6, amps: 0.3 },
  ];

  it("fits the resistance as the slope of the V–I line", () => {
    expect(fitResistance(resistorReadings)).toBeCloseTo(10, 10);
    expect(fitResistance([{ volts: 0, amps: 0 }])).toBeNull();
  });

  it("says a resistor follows Ohm's law and a bulb does not", () => {
    expect(followsOhmsLaw(resistorReadings)).toBe(true);
    expect(followsOhmsLaw(bulbReadings)).toBe(false);
  });

  it("needs at least two readings with current", () => {
    expect(followsOhmsLaw([{ volts: 1.5, amps: 0.15 }, { volts: 0, amps: 0 }])).toBeNull();
  });
});
