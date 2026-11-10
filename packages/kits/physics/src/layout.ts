import type { Circuit } from "./circuit.js";
import type { CircuitComponent, CircuitPartKind } from "./components.js";

/** A point in scene units. The circuit lies flat in the x-y plane (z = 0). */
export type CircuitPoint = { readonly x: number; readonly y: number; readonly z: number };

/** One part placed in the drawing. */
export type CircuitLayoutPart = {
  readonly id: string;
  readonly kind: CircuitPartKind;
  /** Centre of the part. */
  readonly position: CircuitPoint;
  /** Direction the current runs through the part, in radians from the +x axis. */
  readonly angle: number;
  /** Length of the part along the wire. */
  readonly length: number;
  /** "loop" parts sit on the main loop; "across" parts sit on a bracket beside their target. */
  readonly placement: "loop" | "across";
  /** Unit vector pointing out of the loop, away from its centre. */
  readonly outward: CircuitPoint;
  /**
   * Where to show the part's label: inside the loop for loop parts (the outside is kept
   * for meters connected across them), and beyond the meter for parts placed across.
   */
  readonly labelAnchor: CircuitPoint;
  /** Which side of `labelAnchor` the label sits on, so it grows away from the part. */
  readonly labelSide: "left" | "right" | "above" | "below";
  /** Where a part connected across this one would sit (loop parts only; else the position). */
  readonly acrossAnchor: CircuitPoint;
};

/** View-only geometry for a series loop, centred on the origin. */
export type CircuitLayout = {
  readonly parts: readonly CircuitLayoutPart[];
  /** Wire polylines between parts, including the brackets of parts placed across others. */
  readonly wires: readonly (readonly CircuitPoint[])[];
  /**
   * The main loop as a closed polyline, in the direction of conventional current: out of
   * the battery's + terminal, through the circuit, and back to its − terminal.
   */
  readonly loop: readonly CircuitPoint[];
  /** Overall size, including brackets and labels, for fitting the camera. */
  readonly width: number;
  readonly height: number;
};

/** Options for {@link layoutSeriesLoop}. */
export type SeriesLoopLayoutOptions = {
  /** Width and height of the main loop rectangle. Defaults to 10 × 6. */
  readonly width?: number;
  readonly height?: number;
};

const PART_LENGTH: Readonly<Record<CircuitPartKind, number>> = {
  battery: 0,
  resistor: 2.2,
  bulb: 1.6,
  switch: 1.8,
  ammeter: 1.7,
  voltmeter: 1.7,
  wire: 1.4,
};
const CELL_LENGTH = 0.7;
const BRACKET_OFFSET = 2.1;
/** Gap from a part's centre to the near edge of its label. */
const LABEL_OFFSET = 1.0;
const ATTACH_GAP = 0.3;

/** Length a part takes along the wire; a battery grows with its cells. */
export function partLength(part: CircuitComponent): number {
  return part.kind === "battery" ? 0.5 + CELL_LENGTH * part.cells : PART_LENGTH[part.kind];
}

/**
 * Draw a circuit as one rectangular loop: the battery in the middle of the bottom side
 * (+ terminal on the left), the other loop parts spread evenly along the left, top and
 * right sides in the order the current reaches them. Parts that are not on the loop
 * (such as voltmeters) sit on a bracket just outside the part they are across.
 *
 * Returns null when the circuit has no battery or is not one closed loop. Pure.
 */
export function layoutSeriesLoop(circuit: Circuit, options: SeriesLoopLayoutOptions = {}): CircuitLayout | null {
  const width = options.width ?? 10;
  const height = options.height ?? 6;
  const order = loopOrder(circuit);
  if (!order) return null;
  const [batteryStep, ...otherSteps] = order;
  if (!batteryStep) return null;
  const batteryPart = batteryStep.part;
  const others = otherSteps.map((step) => step.part);

  const path = new RectPath(width, height);
  const along = (2 * height + width) / Math.max(1, others.length);
  const placed: { part: CircuitComponent; s: number; length: number }[] = [
    { part: batteryPart, s: 0, length: partLength(batteryPart) },
    ...others.map((part, index) => ({ part, s: width / 2 + (index + 0.5) * along, length: partLength(part) })),
  ];

  const parts: CircuitLayoutPart[] = [];
  /** For each node, where on the loop it can be reached: [start, end] of its free wire. */
  const nodeSpan = new Map<string, { from: number; to: number }>();
  placed.forEach((entry, index) => {
    const next = placed[(index + 1) % placed.length];
    if (!next) return;
    const exitNode = order[index]?.exit ?? entry.part.b;
    const from = entry.s + entry.length / 2;
    const to = (next.s - next.length / 2 + path.total) % path.total || path.total;
    nodeSpan.set(exitNode, { from, to: to < from ? to + path.total : to });
    const position = path.pointAt(entry.s);
    const outward = path.outwardAt(entry.s);
    parts.push({
      id: entry.part.id,
      kind: entry.part.kind,
      position,
      angle: path.angleAt(entry.s),
      length: entry.length,
      placement: "loop",
      outward,
      labelAnchor: offset(position, outward, -LABEL_OFFSET),
      labelSide: sideOf({ x: -outward.x, y: -outward.y, z: 0 }),
      acrossAnchor: offset(position, outward, BRACKET_OFFSET),
    });
  });

  const wires: CircuitPoint[][] = [];
  for (const span of nodeSpan.values()) wires.push(path.slice(span.from, span.to));

  const onLoop = new Set(order.map((step) => step.part.id));
  for (const part of circuit.components) {
    if (onLoop.has(part.id)) continue;
    const target = order.map((step) => step.part).find(
      (candidate) => (candidate.a === part.a && candidate.b === part.b) || (candidate.a === part.b && candidate.b === part.a),
    );
    const targetEntry = target ? placed.find((entry) => entry.part.id === target.id) : undefined;
    let start: number;
    let end: number;
    if (targetEntry) {
      start = targetEntry.s - targetEntry.length / 2 - ATTACH_GAP;
      end = targetEntry.s + targetEntry.length / 2 + ATTACH_GAP;
    } else {
      const spanA = nodeSpan.get(part.a);
      const spanB = nodeSpan.get(part.b);
      if (!spanA || !spanB) continue;
      start = (spanA.from + spanA.to) / 2;
      end = (spanB.from + spanB.to) / 2;
      if (end < start) [start, end] = [end, start];
    }
    const middle = (start + end) / 2;
    const outward = path.outwardAt(middle);
    const a = path.pointAt(start);
    const b = path.pointAt(end);
    const aOut = offset(a, outward, BRACKET_OFFSET);
    const bOut = offset(b, outward, BRACKET_OFFSET);
    const position = { x: (aOut.x + bOut.x) / 2, y: (aOut.y + bOut.y) / 2, z: 0 };
    const length = partLength(part);
    const direction = unit(aOut, bOut);
    const half = Math.min(length / 2, distance(aOut, bOut) / 2);
    wires.push([a, aOut, offset(position, direction, -half)], [offset(position, direction, half), bOut, b]);
    parts.push({
      id: part.id,
      kind: part.kind,
      position,
      angle: Math.atan2(direction.y, direction.x),
      length,
      placement: "across",
      outward,
      labelAnchor: offset(position, outward, LABEL_OFFSET),
      labelSide: sideOf(outward),
      acrossAnchor: position,
    });
  }

  const loop = path.slice(0, path.total);
  // Brackets, the meters on them, and the meters' labels sit outside the loop.
  const margin = 2 * (BRACKET_OFFSET + LABEL_OFFSET + 1.6);
  return { parts, wires, loop, width: width + margin, height: height + margin };
}

/**
 * The loop parts in current order, battery first, each with the node the current leaves
 * it by. Null when the circuit is not one closed loop through the battery. Voltmeters and
 * parts beside the loop are left out.
 */
function loopOrder(circuit: Circuit): readonly { part: CircuitComponent; exit: string }[] | null {
  const batteryPart = circuit.components.find((part) => part.kind === "battery");
  if (!batteryPart) return null;
  const order: { part: CircuitComponent; exit: string }[] = [{ part: batteryPart, exit: batteryPart.a }];
  const used = new Set([batteryPart.id]);
  let node = batteryPart.a;
  while (node !== batteryPart.b) {
    const next = circuit.components.find(
      (part) => !used.has(part.id) && part.kind !== "voltmeter" && (part.a === node || part.b === node),
    );
    if (!next) return null;
    used.add(next.id);
    node = next.a === node ? next.b : next.a;
    order.push({ part: next, exit: node });
  }
  return order;
}

function sideOf(direction: CircuitPoint): CircuitLayoutPart["labelSide"] {
  if (direction.x > 0.5) return "right";
  if (direction.x < -0.5) return "left";
  return direction.y > 0 ? "above" : "below";
}

function offset(point: CircuitPoint, direction: CircuitPoint, amount: number): CircuitPoint {
  return { x: point.x + direction.x * amount, y: point.y + direction.y * amount, z: 0 };
}

function distance(a: CircuitPoint, b: CircuitPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function unit(a: CircuitPoint, b: CircuitPoint): CircuitPoint {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length, z: 0 };
}

/**
 * The loop rectangle as a path measured by distance `s`, starting at the middle of the
 * bottom side and running left, up, right, down and back (the current's direction).
 */
class RectPath {
  readonly total: number;
  private readonly corners: readonly CircuitPoint[];
  private readonly lengths: readonly number[];

  constructor(width: number, height: number) {
    const w = width / 2;
    const h = height / 2;
    this.corners = [
      { x: 0, y: -h, z: 0 },
      { x: -w, y: -h, z: 0 },
      { x: -w, y: h, z: 0 },
      { x: w, y: h, z: 0 },
      { x: w, y: -h, z: 0 },
      { x: 0, y: -h, z: 0 },
    ];
    const lengths: number[] = [];
    for (let index = 1; index < this.corners.length; index += 1) {
      lengths.push(distance(this.corners[index - 1] as CircuitPoint, this.corners[index] as CircuitPoint));
    }
    this.lengths = lengths;
    this.total = lengths.reduce((sum, length) => sum + length, 0);
  }

  pointAt(s: number): CircuitPoint {
    const { index, t } = this.locate(s);
    const a = this.corners[index] as CircuitPoint;
    const b = this.corners[index + 1] as CircuitPoint;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 };
  }

  angleAt(s: number): number {
    const { index } = this.locate(s);
    const a = this.corners[index] as CircuitPoint;
    const b = this.corners[index + 1] as CircuitPoint;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Out of the rectangle: the current runs clockwise, so outward is its direction turned left. */
  outwardAt(s: number): CircuitPoint {
    const angle = this.angleAt(s) + Math.PI / 2;
    return { x: Math.round(Math.cos(angle) * 1e9) / 1e9 + 0, y: Math.round(Math.sin(angle) * 1e9) / 1e9 + 0, z: 0 };
  }

  /** Points from `from` to `to` (to may pass the end and wrap), including corners between. */
  slice(from: number, to: number): CircuitPoint[] {
    const points = [this.pointAt(from)];
    let cornerS = 0;
    for (let lap = 0; lap < 2; lap += 1) {
      for (let index = 0; index < this.lengths.length; index += 1) {
        cornerS += this.lengths[index] ?? 0;
        const s = cornerS;
        if (s > from + 1e-9 && s < to - 1e-9) points.push(this.pointAt(s));
      }
    }
    points.push(this.pointAt(to));
    return points;
  }

  private locate(s: number): { index: number; t: number } {
    let rest = ((s % this.total) + this.total) % this.total;
    for (let index = 0; index < this.lengths.length; index += 1) {
      const length = this.lengths[index] ?? 0;
      if (rest <= length || index === this.lengths.length - 1) return { index, t: length === 0 ? 0 : Math.min(1, rest / length) };
      rest -= length;
    }
    return { index: 0, t: 0 };
  }
}
