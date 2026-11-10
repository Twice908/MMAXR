import { type Circuit } from "./circuit.js";
import { isLoad, isZeroResistance, partName, type CircuitComponent } from "./components.js";

/** Why a part is in the wrong place. */
export type PlacementIssueCode =
  | "voltmeter-in-series"
  | "voltmeter-not-connected"
  | "ammeter-in-parallel"
  | "ammeter-short-circuit"
  | "short-circuit";

/** One wiring problem, with a plain-English reason for the student. */
export interface PlacementIssue {
  readonly code: PlacementIssueCode;
  /** The meter or battery the problem is about. */
  readonly componentId: string;
  readonly message: string;
}

/**
 * Check how meters and batteries are wired, whatever the circuit's shape. Switches count
 * as closed here, because wiring should be right before the switch is pressed.
 *
 * - A voltmeter must be across (in parallel with) parts. It is in series when every other
 *   path between its ends passes through both a battery and a load.
 * - An ammeter must be in series. It is in parallel with a load when another path between
 *   its ends avoids every battery, and it short-circuits a battery when another path has
 *   no load in it.
 * - A battery is short-circuited when its terminals are joined by parts with no resistance.
 *
 * An empty result means the wiring is right.
 */
export function placementIssues(circuit: Circuit): readonly PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  const conductors = circuit.components.filter((component) => component.kind !== "voltmeter");

  for (const meter of circuit.components) {
    if (meter.kind === "voltmeter") {
      const touches = (node: string) => conductors.some((part) => part.a === node || part.b === node);
      if (!touches(meter.a) || !touches(meter.b)) {
        issues.push({
          code: "voltmeter-not-connected",
          componentId: meter.id,
          message: "Connect both ends of the voltmeter to the circuit.",
        });
        continue;
      }
      const sourceFree = findPath(conductors, meter.a, meter.b, (part) => part.kind !== "battery");
      const loadFree = findPath(conductors, meter.a, meter.b, (part) => !isLoad(part));
      if (!sourceFree && !loadFree) {
        issues.push({
          code: "voltmeter-in-series",
          componentId: meter.id,
          message:
            "The voltmeter is in series, in the path of the current. A voltmeter has a very high resistance, so almost no current would flow. Connect it across (in parallel with) the part you want to measure.",
        });
      }
    } else if (meter.kind === "ammeter") {
      const others = conductors.filter((part) => part.id !== meter.id);
      // Judge each ammeter on its own: another misplaced ammeter must not make this one look wrong.
      const group = zeroResistanceGroups(others.filter((part) => part.kind !== "ammeter"));
      const acrossBattery = others.some(
        (part) =>
          part.kind === "battery" &&
          ((group(part.a) === group(meter.a) && group(part.b) === group(meter.b)) ||
            (group(part.a) === group(meter.b) && group(part.b) === group(meter.a))),
      );
      // A load wired straight to the ammeter's ends is what the student put it across, so
      // name that load even when, with nothing else in the loop, it also shorts the battery.
      const directLoad = others.find(
        (part) => isLoad(part) && ((part.a === meter.a && part.b === meter.b) || (part.a === meter.b && part.b === meter.a)),
      );
      if (acrossBattery && !directLoad) {
        issues.push({
          code: "ammeter-short-circuit",
          componentId: meter.id,
          message:
            "The ammeter is connected straight across the battery. An ammeter has almost no resistance, so this is a short circuit: a very large current would flow and could damage the ammeter and the battery. Connect the ammeter in series, in the path of the current.",
        });
        continue;
      }
      const bypass = findPath(others, meter.a, meter.b, (part) => part.kind !== "battery");
      const skipped = directLoad ?? bypass?.find((part) => isLoad(part));
      if (bypass) {
        const name = skipped ? `the ${partName(skipped)}` : "part of the circuit";
        issues.push({
          code: "ammeter-in-parallel",
          componentId: meter.id,
          message: `The ammeter is in parallel with ${name}. An ammeter has almost no resistance, so the current would take the ammeter's path instead of flowing through ${name}. Connect the ammeter in series, in the path of the current.`,
        });
      }
    }
  }

  // A wrongly placed ammeter already explains any short circuit it causes.
  if (!issues.some((issue) => issue.code === "ammeter-short-circuit" || issue.code === "ammeter-in-parallel")) {
    for (const source of conductors) {
      if (source.kind !== "battery") continue;
      const others = conductors.filter((part) => part.id !== source.id);
      if (findPath(others, source.a, source.b, (part) => isZeroResistance(part))) {
        issues.push({
          code: "short-circuit",
          componentId: source.id,
          message:
            "The battery's terminals are joined with no resistance in between. This is a short circuit: a very large current would flow. Put a resistor or a bulb in the path of the current.",
        });
      }
    }
  }
  return issues;
}

/**
 * Whether the part `meterId` is connected across the part `targetId`: its ends join the
 * target's ends through wires, switches or ammeters only, so it measures the potential
 * difference across the target.
 */
export function isAcross(circuit: Circuit, meterId: string, targetId: string): boolean {
  const meter = circuit.components.find((part) => part.id === meterId);
  const target = circuit.components.find((part) => part.id === targetId);
  if (!meter || !target) return false;
  const group = zeroResistanceGroups(
    circuit.components.filter((part) => part.id !== meterId && part.id !== targetId),
  );
  return (
    (group(meter.a) === group(target.a) && group(meter.b) === group(target.b)) ||
    (group(meter.a) === group(target.b) && group(meter.b) === group(target.a))
  );
}

/**
 * Group nodes joined by parts with no resistance (wires, switches, ammeters). Returns a
 * function that gives each node's group name; nodes in one group are at the same potential.
 */
function zeroResistanceGroups(parts: readonly CircuitComponent[]): (node: string) => string {
  const parent = new Map<string, string>();
  const find = (node: string): string => {
    let root = node;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  for (const part of parts) {
    if (!isZeroResistance(part)) continue;
    const rootA = find(part.a);
    const rootB = find(part.b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }
  return find;
}

/**
 * Breadth-first search from node `from` to node `to` using only parts that pass `allow`.
 * Returns the parts along the path, or undefined when there is none.
 */
function findPath(
  parts: readonly CircuitComponent[],
  from: string,
  to: string,
  allow: (part: CircuitComponent) => boolean,
): readonly CircuitComponent[] | undefined {
  if (from === to) return [];
  const usable = parts.filter(allow);
  const cameFrom = new Map<string, { node: string; part: CircuitComponent }>();
  const visited = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const part of usable) {
      const next = part.a === node ? part.b : part.b === node ? part.a : undefined;
      if (next === undefined || visited.has(next)) continue;
      visited.add(next);
      cameFrom.set(next, { node, part });
      if (next === to) return tracePath(cameFrom, from, to);
      queue.push(next);
    }
  }
  return undefined;
}

function tracePath(
  cameFrom: ReadonlyMap<string, { node: string; part: CircuitComponent }>,
  from: string,
  to: string,
): readonly CircuitComponent[] {
  const path: CircuitComponent[] = [];
  let node = to;
  while (node !== from) {
    const step = cameFrom.get(node);
    if (!step) break;
    path.unshift(step.part);
    node = step.node;
  }
  return path;
}
