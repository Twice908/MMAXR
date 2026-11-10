import type { DeepReadonly, Reducer } from "@mma/engine-core";
import {
  circuitIssues,
  componentById,
  connectBetween,
  removeComponent,
  replacePart,
  type Circuit,
} from "./circuit.js";
import { isLoad, partName, type CircuitPart } from "./components.js";
import { roundToResolution, type VoltAmpReading } from "./ohms-law.js";
import { isAcross, placementIssues } from "./placement.js";
import { readingFor, solveCircuit } from "./solver.js";

/** One row of the student's readings table, as the meters showed it. */
export type BenchReading = VoltAmpReading & {
  /** Id of the resistor or bulb that was measured. */
  readonly loadId: string;
  readonly loadKind: "resistor" | "bulb";
  /** The resistor's value, or null for a bulb (its resistance changes). */
  readonly loadOhms: number | null;
  readonly cells: number;
};

/** Serializable state of a circuit on the bench, with the readings taken so far. */
export type CircuitBenchState = {
  readonly circuit: Circuit;
  /** The circuit the bench started with, used by reset. */
  readonly initialCircuit: Circuit;
  readonly readings: readonly BenchReading[];
  readonly validationMessages: readonly string[];
};

/** Action types handled by {@link createCircuitBenchReducer}. */
export const CIRCUIT_BENCH_ACTION = {
  setCells: "circuit/set-cells",
  setSwitch: "circuit/set-switch",
  replacePart: "circuit/replace-part",
  connect: "circuit/connect",
  disconnect: "circuit/disconnect",
  rewire: "circuit/rewire",
  recordReading: "circuit/record-reading",
  clearReadings: "circuit/clear-readings",
  reset: "circuit/reset",
  clearValidation: "circuit/clear-validation",
} as const;

/** Actions that change the circuit on the bench or record what the meters show. */
export type CircuitBenchAction =
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.setCells;
      readonly payload: { readonly batteryId: string; readonly cells: number };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.setSwitch;
      readonly payload: { readonly switchId: string; readonly closed: boolean };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.replacePart;
      /** Swap `targetId` for `part`, keeping its terminals (change a resistor, fill a gap). */
      readonly payload: { readonly targetId: string; readonly part: CircuitPart };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.connect;
      /** Add `part` between nodes `a` and `b`, such as a voltmeter across a resistor. */
      readonly payload: { readonly part: CircuitPart; readonly a: string; readonly b: string };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.disconnect;
      readonly payload: { readonly id: string };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.rewire;
      /**
       * Replace the whole wiring in one step, for moves that take several edits (such as
       * moving a meter). Checked like any other change.
       */
      readonly payload: { readonly circuit: Circuit };
    }
  | {
      readonly type: typeof CIRCUIT_BENCH_ACTION.recordReading;
      /** Read the ammeter and the voltmeter across the load `loadId`. */
      readonly payload: { readonly ammeterId: string; readonly voltmeterId: string; readonly loadId: string };
    }
  | { readonly type: typeof CIRCUIT_BENCH_ACTION.clearReadings; readonly payload: null }
  | { readonly type: typeof CIRCUIT_BENCH_ACTION.reset; readonly payload: null }
  | { readonly type: typeof CIRCUIT_BENCH_ACTION.clearValidation; readonly payload: null };

/**
 * Put a circuit on the bench. Throws a RangeError when the circuit is built wrongly or
 * wired wrongly, because a lesson must start from a working circuit.
 */
export function createCircuitBenchState(circuit: Circuit): CircuitBenchState {
  const issues = [...circuitIssues(circuit), ...placementIssues(circuit).map((issue) => issue.message)];
  if (issues.length > 0) throw new RangeError(issues.join(" "));
  return { circuit, initialCircuit: circuit, readings: [], validationMessages: [] };
}

/**
 * Create the bench reducer. Every change is checked first: a wrong value or a wrongly
 * placed meter leaves the circuit unchanged and explains why in `validationMessages`.
 */
export function createCircuitBenchReducer(): Reducer<CircuitBenchState, CircuitBenchAction> {
  return (state, action) => {
    switch (action.type) {
      case CIRCUIT_BENCH_ACTION.setCells: {
        const part = componentById(state.circuit as Circuit, action.payload.batteryId);
        if (part?.kind !== "battery") return reject(state, "There is no battery with that name.");
        return change(state, replacePart(state.circuit as Circuit, part.id, { ...part, cells: action.payload.cells }));
      }
      case CIRCUIT_BENCH_ACTION.setSwitch: {
        const part = componentById(state.circuit as Circuit, action.payload.switchId);
        if (part?.kind !== "switch") return reject(state, "There is no switch with that name.");
        return change(state, replacePart(state.circuit as Circuit, part.id, { ...part, closed: action.payload.closed }));
      }
      case CIRCUIT_BENCH_ACTION.replacePart:
        if (!componentById(state.circuit as Circuit, action.payload.targetId)) {
          return reject(state, "That part is not in the circuit.");
        }
        return change(state, replacePart(state.circuit as Circuit, action.payload.targetId, action.payload.part as CircuitPart));
      case CIRCUIT_BENCH_ACTION.connect:
        return change(
          state,
          connectBetween(state.circuit as Circuit, action.payload.part as CircuitPart, action.payload.a, action.payload.b),
        );
      case CIRCUIT_BENCH_ACTION.disconnect:
        if (!componentById(state.circuit as Circuit, action.payload.id)) {
          return reject(state, "That part is not in the circuit.");
        }
        return change(state, removeComponent(state.circuit as Circuit, action.payload.id));
      case CIRCUIT_BENCH_ACTION.rewire:
        return change(state, action.payload.circuit as Circuit);
      case CIRCUIT_BENCH_ACTION.recordReading:
        return recordReading(state, action.payload.ammeterId, action.payload.voltmeterId, action.payload.loadId);
      case CIRCUIT_BENCH_ACTION.clearReadings:
        return { ...(state as CircuitBenchState), readings: [], validationMessages: [] };
      case CIRCUIT_BENCH_ACTION.reset:
        return createCircuitBenchState(state.initialCircuit as Circuit);
      case CIRCUIT_BENCH_ACTION.clearValidation:
        return state.validationMessages.length > 0
          ? { ...(state as CircuitBenchState), validationMessages: [] }
          : (state as CircuitBenchState);
      default:
        return state as CircuitBenchState;
    }
  };
}

function change(state: DeepReadonly<CircuitBenchState>, next: Circuit): CircuitBenchState {
  const [problem] = [...circuitIssues(next), ...placementIssues(next).map((issue) => issue.message)];
  if (problem !== undefined) return reject(state, problem);
  return { ...(state as CircuitBenchState), circuit: next, validationMessages: [] };
}

function recordReading(
  state: DeepReadonly<CircuitBenchState>,
  ammeterId: string,
  voltmeterId: string,
  loadId: string,
): CircuitBenchState {
  const circuit = state.circuit as Circuit;
  const ammeterPart = componentById(circuit, ammeterId);
  const voltmeterPart = componentById(circuit, voltmeterId);
  if (ammeterPart?.kind !== "ammeter" || voltmeterPart?.kind !== "voltmeter") {
    return reject(state, "Place the ammeter and the voltmeter first.");
  }
  const load = componentById(circuit, loadId);
  if (!load || !isLoad(load) || (load.kind !== "resistor" && load.kind !== "bulb")) {
    return reject(state, "Choose a resistor or a bulb to measure.");
  }
  if (!isAcross(circuit, voltmeterId, loadId)) {
    return reject(
      state,
      `Connect the voltmeter across the ${partName(load)}, so it measures the potential difference across it.`,
    );
  }
  const solution = solveCircuit(circuit);
  if (!solution.solved) return reject(state, solution.issues[0]?.message ?? "This circuit cannot be measured.");
  const amps = roundToResolution(readingFor(solution, ammeterId).amps, ammeterPart.resolution);
  const volts = roundToResolution(readingFor(solution, voltmeterId).volts, voltmeterPart.resolution);
  if (amps === 0) {
    const open = circuit.components.some((part) => part.kind === "switch" && !part.closed);
    return reject(
      state,
      open
        ? "No current is flowing because the switch is open. Close the switch first."
        : "No current is flowing. Check that the circuit makes a complete loop.",
    );
  }
  const cells = circuit.components.find((part) => part.kind === "battery");
  const reading: BenchReading = {
    volts,
    amps,
    loadId,
    loadKind: load.kind,
    loadOhms: load.kind === "resistor" ? load.ohms : null,
    cells: cells?.kind === "battery" ? cells.cells : 0,
  };
  if (state.readings.some((row) => row.loadId === loadId && row.volts === volts && row.amps === amps)) {
    return reject(
      state,
      `You already have this reading. Change the number of cells or the ${partName(load)} first.`,
    );
  }
  return { ...(state as CircuitBenchState), readings: [...(state.readings as BenchReading[]), reading], validationMessages: [] };
}

function reject(state: DeepReadonly<CircuitBenchState>, message: string): CircuitBenchState {
  return { ...(state as CircuitBenchState), validationMessages: [message] };
}
