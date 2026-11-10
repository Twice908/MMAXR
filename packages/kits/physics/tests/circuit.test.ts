import { describe, expect, it } from "vitest";
import {
  ammeter,
  battery,
  bulb,
  bulbCurrent,
  circuitIssues,
  circuitSwitch,
  connectAcross,
  connectBetween,
  placementIssues,
  readingFor,
  replacePart,
  resistor,
  seriesLoop,
  solveCircuit,
  STANDARD_BULB_CURVE,
  voltmeter,
  wire,
  type Circuit,
} from "../src/index.js";

/** Battery, closed switch, empty gap and resistor in one loop, voltmeter across the resistor. */
function bench(cells: number, ohms: number, closed = true): Circuit {
  const loop = seriesLoop([battery("battery", cells), circuitSwitch("key", closed), wire("gap"), resistor("resistor", ohms)]);
  return connectAcross(replacePart(loop, "gap", ammeter("ammeter")), voltmeter("voltmeter"), "resistor");
}

function codes(circuit: Circuit): readonly string[] {
  return placementIssues(circuit).map((issue) => issue.code);
}

describe("building circuits with one-liners", () => {
  it("connects a series loop in the order the current flows", () => {
    const loop = seriesLoop([battery("battery", 2), wire("w"), resistor("r", 10)]);
    expect(loop.components.map(({ id, a, b }) => [id, a, b])).toEqual([
      ["battery", "n1", "n0"],
      ["w", "n1", "n2"],
      ["r", "n2", "n0"],
    ]);
  });

  it("puts a voltmeter across a part with the same terminals", () => {
    const circuit = bench(2, 10);
    const meter = circuit.components.find((part) => part.id === "voltmeter");
    const target = circuit.components.find((part) => part.id === "resistor");
    expect([meter?.a, meter?.b]).toEqual([target?.a, target?.b]);
  });

  it("reports bad values and duplicate ids", () => {
    const loop = seriesLoop([battery("battery", 5), resistor("r", 0), resistor("r", 2)]);
    expect(circuitIssues(loop)).toEqual([
      "The battery holds 1 to 4 cells.",
      "A resistor's resistance must be more than 0 Ω.",
      'Two parts share the id "r".',
    ]);
  });
});

describe("Ohm's law in a series circuit", () => {
  // Teacher-checked values: I = V / R with 1.5 V per cell.
  it.each([
    { cells: 1, ohms: 5, volts: 1.5, amps: 0.3 },
    { cells: 2, ohms: 10, volts: 3, amps: 0.3 },
    { cells: 3, ohms: 10, volts: 4.5, amps: 0.45 },
    { cells: 4, ohms: 2, volts: 6, amps: 3 },
  ])("$cells cell(s) across $ohms Ω read $volts V and $amps A", ({ cells, ohms, volts, amps }) => {
    const solution = solveCircuit(bench(cells, ohms));
    expect(solution.solved).toBe(true);
    expect(readingFor(solution, "voltmeter").volts).toBeCloseTo(volts, 10);
    expect(readingFor(solution, "ammeter").amps).toBeCloseTo(amps, 10);
    expect(readingFor(solution, "battery").amps).toBeCloseTo(amps, 10);
  });

  it("has no current with the switch open; the voltmeter across the switch reads the battery", () => {
    const circuit = connectAcross(bench(2, 10, false), voltmeter("across-key"), "key");
    const solution = solveCircuit(circuit);
    expect(readingFor(solution, "ammeter").amps).toBe(0);
    expect(readingFor(solution, "voltmeter").volts).toBe(0);
    expect(readingFor(solution, "across-key").volts).toBeCloseTo(3, 10);
  });

  it("solves resistors in parallel: two 10 Ω resistors at 3 V draw 0.6 A", () => {
    const circuit = connectBetween(bench(2, 10), resistor("second", 10), "n3", "n0");
    const solution = solveCircuit(circuit);
    expect(readingFor(solution, "ammeter").amps).toBeCloseTo(0.6, 10);
    expect(readingFor(solution, "second").amps).toBeCloseTo(0.3, 10);
  });

  it("gives up on a loop of parts with no resistance", () => {
    const circuit = connectBetween(bench(2, 10), wire("bypass"), "n2", "n3");
    const solution = solveCircuit(circuit);
    expect(solution.solved).toBe(false);
    expect(solution.issues[0]?.code).toBe("zero-resistance-loop");
  });
});

describe("filament bulb", () => {
  it("follows its curve when it is alone with the battery", () => {
    const loop = seriesLoop([battery("battery", 4), ammeter("ammeter"), bulb("lamp", STANDARD_BULB_CURVE)]);
    expect(readingFor(solveCircuit(loop), "ammeter").amps).toBeCloseTo(0.3, 10);
    const oneCell = replacePart(loop, "battery", battery("battery", 1));
    expect(readingFor(solveCircuit(oneCell), "ammeter").amps).toBeCloseTo(0.19, 10);
  });

  it("has a higher resistance when hotter, so it does not obey Ohm's law", () => {
    const coldOhms = 1.5 / bulbCurrent(STANDARD_BULB_CURVE, 1.5);
    const hotOhms = 6 / bulbCurrent(STANDARD_BULB_CURVE, 6);
    expect(hotOhms).toBeGreaterThan(coldOhms);
  });

  it("settles on a point of its curve when it shares the battery with a resistor", () => {
    const loop = seriesLoop([battery("battery", 4), resistor("r", 5), bulb("lamp", STANDARD_BULB_CURVE)]);
    const solution = solveCircuit(loop);
    const lamp = readingFor(solution, "lamp");
    const r = readingFor(solution, "r");
    expect(solution.solved).toBe(true);
    expect(lamp.amps).toBeCloseTo(bulbCurrent(STANDARD_BULB_CURVE, lamp.volts), 8);
    expect(lamp.volts + r.volts).toBeCloseTo(6, 8);
    expect(r.amps).toBeCloseTo(lamp.amps, 8);
  });
});

describe("meter placement", () => {
  const loop = seriesLoop([battery("battery", 2), circuitSwitch("key", true), wire("gap"), resistor("resistor", 10)]);

  it("accepts an ammeter in series and a voltmeter across the resistor or the battery", () => {
    expect(codes(bench(2, 10))).toEqual([]);
    expect(codes(connectAcross(bench(2, 10), voltmeter("v2"), "battery"))).toEqual([]);
  });

  it("rejects a voltmeter in series", () => {
    const issues = placementIssues(replacePart(loop, "gap", voltmeter("voltmeter")));
    expect(issues.map((issue) => issue.code)).toEqual(["voltmeter-in-series"]);
    expect(issues[0]?.message).toContain("very high resistance");
  });

  it("rejects an ammeter in parallel with the resistor and names it", () => {
    const issues = placementIssues(connectAcross(loop, ammeter("ammeter"), "resistor"));
    expect(issues.map((issue) => issue.code)).toEqual(["ammeter-in-parallel"]);
    expect(issues[0]?.message).toContain("in parallel with the resistor");
  });

  it("rejects an ammeter across the battery as a short circuit", () => {
    expect(codes(connectAcross(loop, ammeter("ammeter"), "battery"))).toEqual(["ammeter-short-circuit"]);
  });

  it("rejects a wire across the battery as a short circuit", () => {
    expect(codes(connectAcross(loop, wire("short"), "battery"))).toEqual(["short-circuit"]);
  });

  it("asks for both voltmeter ends to be connected", () => {
    expect(codes(connectBetween(loop, voltmeter("voltmeter"), "n3", "loose"))).toEqual(["voltmeter-not-connected"]);
  });
});
