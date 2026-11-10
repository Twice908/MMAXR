/** One pair of meter readings: potential difference and current. */
export interface VoltAmpReading {
  readonly volts: number;
  readonly amps: number;
}

/** Ohm's law, I = V / R: current in amperes from volts and ohms. */
export function currentFrom(volts: number, ohms: number): number {
  return volts / ohms;
}

/** Ohm's law, V = I × R: potential difference in volts from amperes and ohms. */
export function potentialDifferenceFrom(amps: number, ohms: number): number {
  return amps * ohms;
}

/** Ohm's law, R = V / I: resistance in ohms, or null when no current flows. */
export function resistanceFrom(volts: number, amps: number): number | null {
  return amps === 0 ? null : volts / amps;
}

/**
 * Round to the step a meter shows, for example 0.01. Uses whole steps so 0.15 stays 0.15
 * instead of becoming 0.15000000000000002.
 */
export function roundToResolution(value: number, resolution: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(resolution) - 1e-9));
  const rounded = Math.round(value / resolution) * resolution;
  return Number(rounded.toFixed(decimals)) + 0;
}

/**
 * Best single resistance for a set of readings: the slope of the straight line through
 * the origin that fits the V–I points best (least squares). Null without any current.
 */
export function fitResistance(readings: readonly VoltAmpReading[]): number | null {
  let sumVI = 0;
  let sumII = 0;
  for (const reading of readings) {
    sumVI += reading.volts * reading.amps;
    sumII += reading.amps * reading.amps;
  }
  return sumII === 0 ? null : sumVI / sumII;
}

/**
 * Whether readings follow Ohm's law: V / I is the same for every reading with current,
 * within `tolerance` (a fraction, 0.05 is 5%) of the best-fit resistance. Null when there
 * are fewer than two readings with current, because one point cannot show a pattern.
 */
export function followsOhmsLaw(readings: readonly VoltAmpReading[], tolerance = 0.05): boolean | null {
  const withCurrent = readings.filter((reading) => reading.amps !== 0);
  if (withCurrent.length < 2) return null;
  const fitted = fitResistance(withCurrent);
  if (fitted === null) return null;
  return withCurrent.every((reading) => Math.abs(reading.volts / reading.amps - fitted) <= tolerance * Math.abs(fitted));
}
