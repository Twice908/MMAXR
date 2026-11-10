/** Potential difference of one cell, in volts. */
export const CELL_VOLTS = 1.5;

/** Smallest step a meter shows, in its own unit (0.01 V or 0.01 A). */
export const DEFAULT_METER_RESOLUTION = 0.01;

/** Most cells a battery holds unless the part says otherwise. */
export const DEFAULT_MAX_CELLS = 4;

/** One measured point on a bulb's V–I curve. */
export type BulbCurvePoint = {
  readonly volts: number;
  readonly amps: number;
}

/**
 * How a bulb's current changes with potential difference. Points start at 0 V, 0 A and
 * rise in both volts and amps. Between points the current is interpolated in straight lines.
 */
export type BulbCurve = {
  readonly id: string;
  readonly ratedVolts: number;
  readonly points: readonly BulbCurvePoint[];
  /** "pending" until the teacher has checked the values. */
  readonly reviewStatus: "pending" | "reviewed";
}

/** A battery of identical cells. Terminal `a` is the positive (+) terminal. */
export type BatteryPart = {
  readonly kind: "battery";
  readonly id: string;
  readonly cells: number;
  readonly maxCells: number;
}

/** A fixed resistor. */
export type ResistorPart = {
  readonly kind: "resistor";
  readonly id: string;
  readonly ohms: number;
}

/** A filament bulb: its resistance rises as it heats up, so it does not obey Ohm's law. */
export type BulbPart = {
  readonly kind: "bulb";
  readonly id: string;
  readonly curve: BulbCurve;
}

/** A switch (key). Open breaks the circuit; closed conducts with no resistance. */
export type SwitchPart = {
  readonly kind: "switch";
  readonly id: string;
  readonly closed: boolean;
}

/** An ideal ammeter: no resistance. Terminal `a` is its positive (+) terminal. */
export type AmmeterPart = {
  readonly kind: "ammeter";
  readonly id: string;
  readonly resolution: number;
}

/** An ideal voltmeter: so much resistance that no current flows through it. Terminal `a` is +. */
export type VoltmeterPart = {
  readonly kind: "voltmeter";
  readonly id: string;
  readonly resolution: number;
}

/** A connecting wire with no resistance. Also used as an empty gap a part can replace. */
export type WirePart = {
  readonly kind: "wire";
  readonly id: string;
}

/** Any circuit part before it is connected. Plain, serializable data. */
export type CircuitPart =
  | BatteryPart
  | ResistorPart
  | BulbPart
  | SwitchPart
  | AmmeterPart
  | VoltmeterPart
  | WirePart;

/** The kind of a circuit part. */
export type CircuitPartKind = CircuitPart["kind"];

/** Where a part's two terminals connect. Node names are any strings, such as "n1". */
export type Terminals = {
  /** First terminal; the + terminal of batteries and meters. */
  readonly a: string;
  readonly b: string;
}

/** A part connected between two nodes of a circuit. */
export type CircuitComponent = CircuitPart & Terminals;

/** A battery of `cells` cells (1.5 V each). Example: `battery("battery", 2)` is 3 V. */
export function battery(id: string, cells = 1, maxCells = DEFAULT_MAX_CELLS): BatteryPart {
  return { kind: "battery", id, cells, maxCells };
}

/** A fixed resistor. Example: `resistor("resistor", 10)`. */
export function resistor(id: string, ohms: number): ResistorPart {
  return { kind: "resistor", id, ohms };
}

/** A filament bulb that follows `curve`. Example: `bulb("lamp", STANDARD_BULB_CURVE)`. */
export function bulb(id: string, curve: BulbCurve): BulbPart {
  return { kind: "bulb", id, curve };
}

/** A switch (key), open unless `closed` is true. Example: `circuitSwitch("key")`. */
export function circuitSwitch(id: string, closed = false): SwitchPart {
  return { kind: "switch", id, closed };
}

/** An ideal ammeter. Example: `ammeter("ammeter")`. */
export function ammeter(id: string, resolution = DEFAULT_METER_RESOLUTION): AmmeterPart {
  return { kind: "ammeter", id, resolution };
}

/** An ideal voltmeter. Example: `voltmeter("voltmeter")`. */
export function voltmeter(id: string, resolution = DEFAULT_METER_RESOLUTION): VoltmeterPart {
  return { kind: "voltmeter", id, resolution };
}

/** A connecting wire, or an empty gap. Example: `wire("gap")`. */
export function wire(id: string): WirePart {
  return { kind: "wire", id };
}

/** Potential difference across a battery's terminals: cells × 1.5 V. */
export function batteryVolts(part: Pick<BatteryPart, "cells">): number {
  return part.cells * CELL_VOLTS;
}

/** A load turns electrical energy into something else and has resistance (resistor, bulb). */
export function isLoad(part: Pick<CircuitPart, "kind">): boolean {
  return part.kind === "resistor" || part.kind === "bulb";
}

/** True for parts with no resistance that carry current: wires, switches and ammeters. */
export function isZeroResistance(part: Pick<CircuitPart, "kind">): boolean {
  return part.kind === "wire" || part.kind === "switch" || part.kind === "ammeter";
}

/** Plain English name for messages, such as "resistor" or "voltmeter". */
export function partName(part: Pick<CircuitPart, "kind">): string {
  return part.kind === "switch" ? "switch" : part.kind;
}

/**
 * Problems with one part's values; an empty result means it is valid. Used before a part
 * is placed, so a bad value is rejected with a reason instead of breaking the circuit.
 */
export function partIssues(part: CircuitPart): readonly string[] {
  const issues: string[] = [];
  if (part.id.trim().length === 0) issues.push("Every part needs an id.");
  switch (part.kind) {
    case "battery":
      if (!Number.isInteger(part.maxCells) || part.maxCells < 1) {
        issues.push("A battery must hold at least 1 cell.");
      }
      if (!Number.isInteger(part.cells) || part.cells < 1 || part.cells > part.maxCells) {
        issues.push(`The battery holds 1 to ${part.maxCells} cells.`);
      }
      break;
    case "resistor":
      if (!Number.isFinite(part.ohms) || part.ohms <= 0) {
        issues.push("A resistor's resistance must be more than 0 Ω.");
      }
      break;
    case "bulb":
      issues.push(...bulbCurveIssues(part.curve));
      break;
    case "ammeter":
    case "voltmeter":
      if (!Number.isFinite(part.resolution) || part.resolution <= 0) {
        issues.push(`The ${part.kind}'s resolution must be more than 0.`);
      }
      break;
    case "switch":
    case "wire":
      break;
  }
  return issues;
}

/** Problems with a bulb curve; an empty result means it is valid. */
export function bulbCurveIssues(curve: BulbCurve): readonly string[] {
  const issues: string[] = [];
  const [first] = curve.points;
  if (curve.points.length < 2 || !first || first.volts !== 0 || first.amps !== 0) {
    issues.push(`Bulb curve ${curve.id} must start at 0 V, 0 A and have at least two points.`);
    return issues;
  }
  for (let index = 1; index < curve.points.length; index += 1) {
    const previous = curve.points[index - 1];
    const point = curve.points[index];
    if (!previous || !point) continue;
    if (!(point.volts > previous.volts) || !(point.amps > previous.amps)) {
      issues.push(`Bulb curve ${curve.id} must rise in both volts and amps.`);
      break;
    }
  }
  if (!(curve.ratedVolts > 0)) issues.push(`Bulb curve ${curve.id} needs a rated voltage above 0 V.`);
  return issues;
}

/**
 * Current through a bulb at potential difference `volts`, from its curve. Straight lines
 * join the points; beyond the last point the last line continues. Negative volts give
 * a negative current of the same size.
 */
export function bulbCurrent(curve: BulbCurve, volts: number): number {
  const size = Math.abs(volts);
  const points = curve.points;
  let lower = points[0];
  let upper = points[1];
  for (let index = 1; index < points.length; index += 1) {
    lower = points[index - 1];
    upper = points[index];
    if (upper && size <= upper.volts) break;
  }
  if (!lower || !upper) return 0;
  const slope = (upper.amps - lower.amps) / (upper.volts - lower.volts);
  const amps = lower.amps + slope * (size - lower.volts);
  return Math.sign(volts) * amps;
}
