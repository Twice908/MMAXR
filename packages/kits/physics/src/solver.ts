import { circuitNodes, type Circuit } from "./circuit.js";
import { batteryVolts, bulbCurrent, isLoad, type BulbCurve, type CircuitComponent } from "./components.js";

/** Potential difference and current for one part of a solved circuit. */
export interface ComponentReading {
  readonly id: string;
  /** Potential at terminal `a` minus potential at terminal `b`, in volts. */
  readonly volts: number;
  /**
   * Conventional current through the part from `a` to `b`, in amperes. For a battery it
   * is the current the battery supplies, leaving its + terminal.
   */
  readonly amps: number;
}

/** Why a circuit could not be solved. */
export type SolveIssueCode = "zero-resistance-loop" | "no-convergence";

/** A reason the solver gave up, in plain English. */
export interface SolveIssue {
  readonly code: SolveIssueCode;
  readonly message: string;
}

/** Every part's reading, keyed by part id. */
export interface CircuitSolution {
  readonly solved: boolean;
  readonly issues: readonly SolveIssue[];
  readonly components: Readonly<Record<string, ComponentReading>>;
}

const PIVOT_EPSILON = 1e-12;
const MAX_BULB_ITERATIONS = 500;

/**
 * Solve a direct-current circuit by nodal analysis. Batteries and meters are ideal:
 * a battery gives cells × 1.5 V, an ammeter and a closed switch have no resistance, and
 * no current flows through a voltmeter or an open switch. Bulbs follow their V–I curve,
 * found by repeating the solve until each bulb's resistance settles.
 *
 * Parts that are not joined to the battery read 0 V and 0 A. Pure and deterministic.
 */
export function solveCircuit(circuit: Circuit): CircuitSolution {
  const conducting = circuit.components.filter(
    (part) => part.kind !== "voltmeter" && !(part.kind === "switch" && !part.closed),
  );
  const ground =
    conducting.find((part) => part.kind === "battery")?.b ?? conducting[0]?.b ?? circuitNodes(circuit)[0];
  const reached = ground === undefined ? new Set<string>() : reachableNodes(conducting, ground);

  const nodeIndex = new Map<string, number>();
  for (const node of reached) if (node !== ground) nodeIndex.set(node, nodeIndex.size);
  const active = conducting.filter((part) => reached.has(part.a));
  const sources = active.filter((part) => !isLoad(part));
  const bulbs = active.filter((part): part is Extract<CircuitComponent, { kind: "bulb" }> => part.kind === "bulb");
  const conductance = new Map<string, number>();
  for (const part of active) {
    if (part.kind === "resistor") conductance.set(part.id, 1 / part.ohms);
    if (part.kind === "bulb") conductance.set(part.id, coldConductance(part.curve));
  }

  let solution: readonly number[] | null = null;
  let converged = bulbs.length === 0;
  for (let iteration = 0; iteration < MAX_BULB_ITERATIONS; iteration += 1) {
    solution = solveNodal(nodeIndex, sources, active, conductance);
    if (!solution || bulbs.length === 0) break;
    let settled = true;
    for (const part of bulbs) {
      const volts = potential(solution, nodeIndex, part.a) - potential(solution, nodeIndex, part.b);
      const current = conductance.get(part.id) ?? 0;
      const target = Math.abs(volts) < 1e-9 ? coldConductance(part.curve) : bulbCurrent(part.curve, volts) / volts;
      if (Math.abs(target - current) > 1e-12 + 1e-10 * target) settled = false;
      // Half steps keep the repeat from overshooting where a bulb's resistance changes fast.
      conductance.set(part.id, (current + target) / 2);
    }
    if (settled) {
      converged = true;
      break;
    }
  }

  if (!solution) {
    return failed(circuit, {
      code: "zero-resistance-loop",
      message:
        "Parts with no resistance make a closed loop, so the current cannot be worked out. Take a wire or a meter out of that loop.",
    });
  }
  if (!converged) {
    return failed(circuit, {
      code: "no-convergence",
      message: "The bulb's current could not be worked out for this circuit.",
    });
  }

  const sourceIndex = new Map(sources.map((part, index) => [part.id, nodeIndex.size + index]));
  const components: Record<string, ComponentReading> = {};
  for (const part of circuit.components) {
    const inCircuit = reached.has(part.a) && reached.has(part.b);
    const volts = inCircuit
      ? potential(solution, nodeIndex, part.a) - potential(solution, nodeIndex, part.b)
      : 0;
    let amps = 0;
    const row = sourceIndex.get(part.id);
    if (row !== undefined) {
      const throughAToB = solution[row] ?? 0;
      amps = part.kind === "battery" ? -throughAToB : throughAToB;
    } else if (inCircuit && isLoad(part)) {
      amps = volts * (conductance.get(part.id) ?? 0);
    }
    components[part.id] = { id: part.id, volts: clean(volts), amps: clean(amps) };
  }
  return { solved: true, issues: [], components };
}

/** Reading for one part of a solution, or 0 V and 0 A when the id is unknown. */
export function readingFor(solution: CircuitSolution, id: string): ComponentReading {
  return solution.components[id] ?? { id, volts: 0, amps: 0 };
}

function failed(circuit: Circuit, issue: SolveIssue): CircuitSolution {
  const components: Record<string, ComponentReading> = {};
  for (const part of circuit.components) components[part.id] = { id: part.id, volts: 0, amps: 0 };
  return { solved: false, issues: [issue], components };
}

/**
 * Build and solve the modified nodal equations. Unknowns are node potentials (ground is
 * 0 V) followed by the current from `a` to `b` through each part with no resistance.
 */
function solveNodal(
  nodeIndex: ReadonlyMap<string, number>,
  sources: readonly CircuitComponent[],
  active: readonly CircuitComponent[],
  conductance: ReadonlyMap<string, number>,
): readonly number[] | null {
  const size = nodeIndex.size + sources.length;
  if (size === 0) return [];
  const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  const add = (row: number | undefined, column: number | undefined, value: number) => {
    if (row === undefined || column === undefined) return;
    const cells = matrix[row];
    if (cells) cells[column] = (cells[column] ?? 0) + value;
  };

  for (const part of active) {
    const g = conductance.get(part.id);
    if (g === undefined) continue;
    const a = nodeIndex.get(part.a);
    const b = nodeIndex.get(part.b);
    add(a, a, g);
    add(b, b, g);
    add(a, b, -g);
    add(b, a, -g);
  }
  sources.forEach((part, index) => {
    const row = nodeIndex.size + index;
    const a = nodeIndex.get(part.a);
    const b = nodeIndex.get(part.b);
    // Current leaves node a into the part and arrives at node b.
    add(a, row, 1);
    add(b, row, -1);
    // Potential rule: V(a) - V(b) = battery voltage, or 0 for wires, switches and ammeters.
    add(row, a, 1);
    add(row, b, -1);
    rhs[row] = part.kind === "battery" ? batteryVolts(part) : 0;
  });
  return gaussianSolve(matrix, rhs);
}

/** Solve `matrix · x = rhs` by elimination with partial pivoting; null if singular. */
function gaussianSolve(matrix: number[][], rhs: number[]): readonly number[] | null {
  const size = rhs.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row]?.[column] ?? 0) > Math.abs(matrix[pivot]?.[column] ?? 0)) pivot = row;
    }
    const pivotRow = matrix[pivot];
    const pivotValue = pivotRow?.[column] ?? 0;
    if (!pivotRow || Math.abs(pivotValue) < PIVOT_EPSILON) return null;
    if (pivot !== column) {
      [matrix[column], matrix[pivot]] = [pivotRow, matrix[column] as number[]];
      [rhs[column], rhs[pivot]] = [rhs[pivot] ?? 0, rhs[column] ?? 0];
    }
    for (let row = column + 1; row < size; row += 1) {
      const cells = matrix[row];
      if (!cells) continue;
      const factor = (cells[column] ?? 0) / pivotValue;
      if (factor === 0) continue;
      for (let k = column; k < size; k += 1) cells[k] = (cells[k] ?? 0) - factor * (pivotRow[k] ?? 0);
      rhs[row] = (rhs[row] ?? 0) - factor * (rhs[column] ?? 0);
    }
  }
  const result = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    const cells = matrix[row] as number[];
    let sum = rhs[row] ?? 0;
    for (let k = row + 1; k < size; k += 1) sum -= (cells[k] ?? 0) * (result[k] ?? 0);
    result[row] = sum / (cells[row] ?? 1);
  }
  return result;
}

function reachableNodes(parts: readonly CircuitComponent[], start: string): Set<string> {
  const reached = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const part of parts) {
      const next = part.a === node ? part.b : part.b === node ? part.a : undefined;
      if (next !== undefined && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

function potential(solution: readonly number[], nodeIndex: ReadonlyMap<string, number>, node: string): number {
  const index = nodeIndex.get(node);
  return index === undefined ? 0 : (solution[index] ?? 0);
}

/** Conductance of a cold bulb: the slope of its curve's first segment. */
function coldConductance(curve: BulbCurve): number {
  const point = curve.points[1];
  return point ? point.amps / point.volts : 1;
}

/** Remove floating-point dust such as 1e-17, and -0. */
function clean(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}
