import type {
  DeepReadonly,
  EngineAction,
  JsonValue,
  LearningEventDraft,
  MissionDefinition,
  Reducer,
} from "@mma/engine-core";
import {
  createLessonFlowReducer,
  createLessonFlowState,
  isLessonFlowAction,
  projectLessonFlowEvents,
  type LessonFlowState,
} from "@mma/engine-lesson";
import {
  STANDARD_BULB_CURVE,
  STANDARD_RESISTOR_OHMS,
  ammeter,
  battery,
  bulb,
  circuitSwitch,
  componentById,
  connectAcross,
  createCircuitBenchReducer,
  createCircuitBenchState,
  isAcross,
  removeComponent,
  replacePart,
  resistor,
  seriesLoop,
  voltmeter,
  wire,
  type BenchReading,
  type Circuit,
  type CircuitBenchAction,
  type CircuitBenchState,
  type CircuitComponent,
  type CircuitPart,
} from "@mma/kit-physics";

/** Ids of the parts on the Ohm's Law bench. */
export const PART_ID = {
  battery: "battery",
  key: "key",
  gap: "gap",
  ammeter: "ammeter",
  voltmeter: "voltmeter",
  bulb: "lamp",
} as const;

/** The meters a student places. */
export type MeterKind = "ammeter" | "voltmeter";

/** Where a meter can be placed: in the gap in the loop, or across a part. */
export type MeterSpot = { readonly kind: "gap" } | { readonly kind: "across"; readonly targetId: string };

/** A part the student can test: one of the resistors, or the bulb. */
export interface LoadChoice {
  readonly id: string;
  readonly label: string;
  readonly part: CircuitPart;
}

/** Parts to test, in the order shown: resistors from the kit table, then the bulb. */
export const LOAD_CHOICES: readonly LoadChoice[] = [
  ...STANDARD_RESISTOR_OHMS.map((ohms) => ({ id: `r${ohms}`, label: `${ohms} Ω resistor`, part: resistor(`r${ohms}`, ohms) })),
  { id: PART_ID.bulb, label: "Bulb", part: bulb(PART_ID.bulb, STANDARD_BULB_CURVE) },
];

/** The resistor on the bench when the lesson starts. */
export const STARTING_LOAD_ID = "r10";

/** Least number of different readings each experiment mission asks for. */
export const READINGS_NEEDED = 3;

/** Serializable learner state: the shared lesson flow plus the circuit bench. */
export interface OhmsLawLessonState extends LessonFlowState {
  readonly bench: CircuitBenchState;
}

/**
 * The starting circuit: one cell, an open switch, an empty gap for the ammeter, and the
 * 10 Ω resistor, in one loop. The voltmeter is not connected yet.
 */
export function createOhmsLawCircuit(): Circuit {
  const load = LOAD_CHOICES.find((choice) => choice.id === STARTING_LOAD_ID)?.part ?? resistor(STARTING_LOAD_ID, 10);
  return seriesLoop([battery(PART_ID.battery, 1), circuitSwitch(PART_ID.key), wire(PART_ID.gap), load]);
}

/** Create the lesson and bench state, with no mission started. */
export function createOhmsLawLessonState(missions: readonly MissionDefinition[]): OhmsLawLessonState {
  return { bench: createCircuitBenchState(createOhmsLawCircuit()), ...createLessonFlowState(missions) };
}

const CIRCUIT_ACTION_PREFIX = "circuit/";

/**
 * Create the pure reducer: lesson actions go to the shared lesson flow, `circuit/*`
 * actions to the physics kit's bench, and anything else is ignored.
 */
export function createOhmsLawLessonReducer(
  missions: readonly MissionDefinition[],
  rawAssessmentItems: readonly unknown[],
): Reducer<OhmsLawLessonState, EngineAction> {
  const lessonFlow = createLessonFlowReducer(missions, rawAssessmentItems);
  const benchReducer = createCircuitBenchReducer();
  return (state, action) => {
    if (isLessonFlowAction(action)) return lessonFlow<OhmsLawLessonState>(state, action);
    if (action.type.startsWith(CIRCUIT_ACTION_PREFIX)) {
      const bench = benchReducer(state.bench, action as CircuitBenchAction);
      return bench === state.bench ? (state as OhmsLawLessonState) : ({ ...state, bench } as OhmsLawLessonState);
    }
    return state as OhmsLawLessonState;
  };
}

/** Project dispatched lesson actions to learning telemetry drafts. */
export function projectOhmsLawLessonEvents(
  missions: readonly MissionDefinition[],
  action: Readonly<EngineAction>,
  previousState: DeepReadonly<OhmsLawLessonState>,
  nextState: DeepReadonly<OhmsLawLessonState>,
): readonly LearningEventDraft[] {
  return projectLessonFlowEvents(missions, action, previousState, nextState);
}

/** The resistor or bulb in the loop. */
export function currentLoad(circuit: Circuit): CircuitComponent | undefined {
  return circuit.components.find((part) => part.kind === "resistor" || part.kind === "bulb");
}

/** Where a meter is now, or null when it is not on the bench. */
export function meterSpot(circuit: Circuit, kind: MeterKind): MeterSpot | null {
  const meter = componentById(circuit, PART_ID[kind]);
  if (!meter) return null;
  const gap = gapTerminals();
  if (meter.a === gap.a && meter.b === gap.b) return { kind: "gap" };
  // Prefer the part wired straight to the meter's ends: with ideal wires, a meter across the
  // only resistor is also electrically across the battery, but the student chose the resistor.
  const others = circuit.components.filter((part) => part.id !== meter.id && part.kind !== "voltmeter");
  const target =
    others.find((part) => (part.a === meter.a && part.b === meter.b) || (part.a === meter.b && part.b === meter.a)) ??
    others.find((part) => isAcross(circuit, meter.id, part.id));
  return target ? { kind: "across", targetId: target.id } : null;
}

/**
 * The wiring after moving a meter to `spot` (taking it off the bench first). The result
 * is not checked here; the bench reducer rejects wrong wiring with the reason.
 */
export function placeMeter(circuit: Circuit, kind: MeterKind, spot: MeterSpot): Circuit {
  const part = kind === "ammeter" ? ammeter(PART_ID.ammeter) : voltmeter(PART_ID.voltmeter);
  const cleared = removeMeter(circuit, kind);
  if (spot.kind === "gap") {
    // An occupied gap would need the other meter moved first; leave the wiring as it is.
    return componentById(cleared, PART_ID.gap) ? replacePart(cleared, PART_ID.gap, part) : circuit;
  }
  return connectAcross(cleared, part, spot.targetId);
}

/** Take a meter off the bench, putting the empty gap back if it was in the gap. */
export function removeMeter(circuit: Circuit, kind: MeterKind): Circuit {
  const spot = meterSpot(circuit, kind);
  const id = PART_ID[kind];
  if (!componentById(circuit, id)) return circuit;
  return spot?.kind === "gap" ? replacePart(circuit, id, wire(PART_ID.gap)) : removeComponent(circuit, id);
}

/** Swap the resistor or bulb in the loop for another load choice. */
export function swapLoadAction(circuit: Circuit, loadId: string): EngineAction | null {
  const load = currentLoad(circuit);
  const choice = LOAD_CHOICES.find((item) => item.id === loadId);
  if (!load || !choice || load.id === choice.id) return null;
  return { type: "circuit/replace-part", payload: { targetId: load.id, part: choice.part } };
}

/**
 * The flat record a mission Check compares with its goal:
 * - `ammeterInSeries`, `voltmeterAcrossLoad`, `switchClosed`: the circuit is ready.
 * - `variedPotentialDifference`: one resistor measured with at least three cell counts.
 * - `variedResistance`: at least three resistors measured with the same cell count.
 * - `bulbTested`: the bulb measured with at least three cell counts.
 */
export function ohmsLawCheckState(bench: DeepReadonly<CircuitBenchState>): Readonly<Record<string, JsonValue>> {
  const circuit = bench.circuit as Circuit;
  const readings = bench.readings as readonly BenchReading[];
  const load = currentLoad(circuit);
  const switchPart = componentById(circuit, PART_ID.key);
  const cellsByLoad = groupDistinct(readings, (row) => row.loadId, (row) => row.cells);
  const resistorsByCells = groupDistinct(
    readings.filter((row) => row.loadKind === "resistor"),
    (row) => String(row.cells),
    (row) => row.loadOhms ?? 0,
  );
  return {
    ammeterInSeries: meterSpot(circuit, "ammeter")?.kind === "gap",
    voltmeterAcrossLoad: load !== undefined && voltmeterTarget(circuit) === load.id,
    switchClosed: switchPart?.kind === "switch" && switchPart.closed,
    variedPotentialDifference: readings.some(
      (row) => row.loadKind === "resistor" && (cellsByLoad.get(row.loadId)?.size ?? 0) >= READINGS_NEEDED,
    ),
    variedResistance: [...resistorsByCells.values()].some((ohms) => ohms.size >= READINGS_NEEDED),
    bulbTested: (cellsByLoad.get(PART_ID.bulb)?.size ?? 0) >= READINGS_NEEDED,
    readings: readings.length,
  };
}

function voltmeterTarget(circuit: Circuit): string | null {
  const spot = meterSpot(circuit, "voltmeter");
  return spot?.kind === "across" ? spot.targetId : null;
}

function gapTerminals(): { a: string; b: string } {
  const gap = componentById(createOhmsLawCircuit(), PART_ID.gap);
  return { a: gap?.a ?? "", b: gap?.b ?? "" };
}

function groupDistinct<Row, Value>(
  rows: readonly Row[],
  key: (row: Row) => string,
  value: (row: Row) => Value,
): Map<string, Set<Value>> {
  const groups = new Map<string, Set<Value>>();
  for (const row of rows) {
    const group = groups.get(key(row)) ?? new Set<Value>();
    group.add(value(row));
    groups.set(key(row), group);
  }
  return groups;
}
