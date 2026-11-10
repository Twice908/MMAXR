import { createStore } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  ammeter,
  battery,
  CIRCUIT_BENCH_ACTION,
  circuitSwitch,
  connectAcross,
  createCircuitBenchReducer,
  createCircuitBenchState,
  resistor,
  seriesLoop,
  voltmeter,
  wire,
  type CircuitBenchAction,
} from "../src/index.js";

function setup() {
  const loop = seriesLoop([battery("battery", 1), circuitSwitch("key"), wire("gap"), resistor("r10", 10)]);
  const state = createCircuitBenchState(loop);
  return createStore<ReturnType<typeof createCircuitBenchState>, CircuitBenchAction>(createCircuitBenchReducer(), state);
}

const record = { type: CIRCUIT_BENCH_ACTION.recordReading, payload: { ammeterId: "ammeter", voltmeterId: "voltmeter", loadId: "r10" } } as const;

describe("circuit bench", () => {
  it("refuses to start from a wrongly wired circuit", () => {
    const loop = seriesLoop([battery("battery", 1), resistor("r", 10)]);
    expect(() => createCircuitBenchState(connectAcross(loop, ammeter("a"), "r"))).toThrow(RangeError);
  });

  it("rejects a voltmeter in the series gap and keeps the circuit unchanged", () => {
    const store = setup();
    const before = store.getState().circuit;
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.replacePart, payload: { targetId: "gap", part: voltmeter("voltmeter") } });
    expect(store.getState().circuit).toEqual(before);
    expect(store.getState().validationMessages[0]).toContain("The voltmeter is in series");
  });

  it("records readings as the meters show them, then rejects a repeat", () => {
    const store = setup();
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.replacePart, payload: { targetId: "gap", part: ammeter("ammeter") } });
    const r = store.getState().circuit.components.find((part) => part.id === "r10");
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.connect, payload: { part: voltmeter("voltmeter"), a: r?.a ?? "", b: r?.b ?? "" } });
    expect(store.getState().validationMessages).toEqual([]);

    store.dispatch(record);
    expect(store.getState().validationMessages[0]).toContain("switch is open");

    store.dispatch({ type: CIRCUIT_BENCH_ACTION.setSwitch, payload: { switchId: "key", closed: true } });
    store.dispatch(record);
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.setCells, payload: { batteryId: "battery", cells: 2 } });
    store.dispatch(record);
    expect(store.getState().readings).toEqual([
      { volts: 1.5, amps: 0.15, loadId: "r10", loadKind: "resistor", loadOhms: 10, cells: 1 },
      { volts: 3, amps: 0.3, loadId: "r10", loadKind: "resistor", loadOhms: 10, cells: 2 },
    ]);

    store.dispatch(record);
    expect(store.getState().readings).toHaveLength(2);
    expect(store.getState().validationMessages[0]).toContain("already have this reading");
  });

  it("rewires in one step, and rejects wrong wiring with the reason", () => {
    const store = setup();
    const withMeters = connectAcross(
      { components: store.getState().circuit.components.map((part) => (part.id === "gap" ? { ...ammeter("ammeter"), a: part.a, b: part.b } : part)) },
      voltmeter("voltmeter"),
      "r10",
    );
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.rewire, payload: { circuit: withMeters } });
    expect(store.getState().circuit).toEqual(withMeters);

    store.dispatch({ type: CIRCUIT_BENCH_ACTION.rewire, payload: { circuit: connectAcross(withMeters, ammeter("second"), "r10") } });
    expect(store.getState().circuit).toEqual(withMeters);
    expect(store.getState().validationMessages[0]).toContain("in parallel with the resistor");
  });

  it("swaps the resistor, rejects too many cells, and resets", () => {
    const store = setup();
    store.dispatch({ type: CIRCUIT_BENCH_ACTION.replacePart, payload: { targetId: "r10", part: resistor("r5", 5) } });
    expect(store.getState().circuit.components.some((part) => part.id === "r5")).toBe(true);

    store.dispatch({ type: CIRCUIT_BENCH_ACTION.setCells, payload: { batteryId: "battery", cells: 5 } });
    expect(store.getState().validationMessages).toEqual(["The battery holds 1 to 4 cells."]);

    store.dispatch({ type: CIRCUIT_BENCH_ACTION.reset, payload: null });
    expect(store.getState().circuit).toEqual(store.getState().initialCircuit);
    expect(store.getState().circuit.components.some((part) => part.id === "r10")).toBe(true);
  });
});
