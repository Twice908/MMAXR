import { partIssues, type CircuitComponent, type CircuitPart } from "./components.js";

/** A circuit: parts connected between named nodes. Plain, serializable data. */
export type Circuit = {
  readonly components: readonly CircuitComponent[];
}

/**
 * Connect parts in one loop, in the order the current flows. A battery is turned so its
 * + terminal faces the next part, and every other part's `a` terminal faces the current,
 * so meters read positive. Nodes are named "n0", "n1", ...
 *
 * @example
 * seriesLoop([battery("battery", 2), circuitSwitch("key"), wire("gap"), resistor("resistor", 10)])
 */
export function seriesLoop(parts: readonly CircuitPart[]): Circuit {
  const count = parts.length;
  const components = parts.map((part, index): CircuitComponent => {
    const from = `n${index}`;
    const to = `n${(index + 1) % count}`;
    // Current leaves the battery's + terminal and flows on to the next part.
    return part.kind === "battery" ? { ...part, a: to, b: from } : { ...part, a: from, b: to };
  });
  return { components };
}

/** Add a part between nodes `a` and `b`. Example: `connectBetween(circuit, wire("w"), "n1", "n3")`. */
export function connectBetween(circuit: Circuit, part: CircuitPart, a: string, b: string): Circuit {
  return { components: [...circuit.components, { ...part, a, b }] };
}

/**
 * Add a part across (in parallel with) an existing component, with the same terminal
 * order, so a voltmeter's + terminal goes to the side the current enters.
 * Returns the circuit unchanged if `targetId` is not in it.
 *
 * @example
 * connectAcross(circuit, voltmeter("voltmeter"), "resistor")
 */
export function connectAcross(circuit: Circuit, part: CircuitPart, targetId: string): Circuit {
  const target = componentById(circuit, targetId);
  return target ? connectBetween(circuit, part, target.a, target.b) : circuit;
}

/**
 * Swap the part with id `targetId` for `part`, keeping its terminals. Use it to change
 * a resistor, or to put an ammeter into an empty gap. Unchanged if `targetId` is missing.
 */
export function replacePart(circuit: Circuit, targetId: string, part: CircuitPart): Circuit {
  if (!componentById(circuit, targetId)) return circuit;
  return {
    components: circuit.components.map((component) =>
      component.id === targetId ? { ...part, a: component.a, b: component.b } : component,
    ),
  };
}

/** Remove the component with id `id`. */
export function removeComponent(circuit: Circuit, id: string): Circuit {
  return { components: circuit.components.filter((component) => component.id !== id) };
}

/** Find a component by id. */
export function componentById(circuit: Circuit, id: string): CircuitComponent | undefined {
  return circuit.components.find((component) => component.id === id);
}

/** Every node name used by the circuit, in first-use order. */
export function circuitNodes(circuit: Circuit): readonly string[] {
  const nodes = new Set<string>();
  for (const component of circuit.components) {
    nodes.add(component.a);
    nodes.add(component.b);
  }
  return [...nodes];
}

/**
 * Problems with how the circuit is built (ids, values, terminals); an empty result means
 * it can be solved. Placement problems such as a voltmeter in series are checked by
 * `placementIssues`.
 */
export function circuitIssues(circuit: Circuit): readonly string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const component of circuit.components) {
    if (seen.has(component.id)) issues.push(`Two parts share the id "${component.id}".`);
    seen.add(component.id);
    issues.push(...partIssues(component));
    if (component.a.length === 0 || component.b.length === 0) {
      issues.push(`Connect both ends of ${component.id}.`);
    } else if (component.a === component.b) {
      issues.push(`Both ends of ${component.id} are joined to the same point.`);
    }
  }
  return issues;
}
