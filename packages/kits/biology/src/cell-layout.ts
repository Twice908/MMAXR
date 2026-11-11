import type { CellKind } from "./organelles.js";
import { seededRandom, type SeededRandom } from "@mma/engine-core";

/** A point or size in content units. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The outer shape of a cell. */
export interface CellBody {
  /** Plant cells are brick-like boxes with rounded corners; animal cells are soft blobs. */
  readonly shape: "rounded-box" | "blob";
  /** Full width, height and depth. */
  readonly size: Vec3;
  /** Cell wall thickness; 0 when there is no wall. */
  readonly wallThickness: number;
  /** How far a blob's surface bulges in or out of its ellipsoid; 0 for boxes. */
  readonly wobble: number;
  /** Seed for the blob's irregular surface, so it looks the same every time. */
  readonly seed: number;
}

/** The nucleus, a sphere with a nucleolus inside. */
export interface CellNucleus {
  readonly position: Vec3;
  readonly radius: number;
  readonly nucleolusRadius: number;
}

/** Endoplasmic reticulum sheets wrapped partly around the nucleus. */
export interface CellReticulum {
  /** Unit vector from the nucleus centre towards the middle of the sheets. */
  readonly facing: Vec3;
  /** Distance of the innermost and outermost sheets from the nucleus centre. */
  readonly innerRadius: number;
  readonly outerRadius: number;
}

/** A vacuole, drawn as an ellipsoid. */
export interface CellVacuole {
  readonly id: string;
  readonly position: Vec3;
  /** Half width, height and depth. */
  readonly radii: Vec3;
}

/** A Golgi apparatus: a stack of curved, flattened sacs. */
export interface CellGolgi {
  readonly id: string;
  readonly position: Vec3;
  /** Unit vector along the stack (from the first sac to the last). */
  readonly axis: Vec3;
  /** Width of the largest sac. */
  readonly size: number;
}

/** Organelles scattered through the cytoplasm. */
export type PlacedOrganelleKind = "mitochondrion" | "chloroplast" | "lysosome" | "ribosome";

/** One organelle placed in the cytoplasm. */
export interface PlacedOrganelle {
  readonly id: string;
  readonly organelle: PlacedOrganelleKind;
  /** Centre, relative to the cell centre. */
  readonly position: Vec3;
  /** Unit vector along the organelle's length. */
  readonly axis: Vec3;
  /** Turn about the axis, in radians. */
  readonly roll: number;
  /** Full length (along the axis), width and depth. */
  readonly size: Vec3;
}

/** Everything needed to draw one cell. Positions are relative to the cell centre. */
export interface CellLayout {
  readonly id: string;
  readonly kind: CellKind;
  /** Where the cell centre sits in the scene. */
  readonly position: Vec3;
  readonly body: CellBody;
  readonly nucleus: CellNucleus;
  readonly reticulum: CellReticulum;
  readonly vacuoles: readonly CellVacuole[];
  readonly golgi: readonly CellGolgi[];
  readonly organelles: readonly PlacedOrganelle[];
}

/** How many small parts to scatter: `full` for desktops and headsets, `light` for phones. */
export type CellDensity = "full" | "light";

/** Options for {@link layoutCell}. */
export interface CellLayoutOptions {
  /** Defaults to the cell kind. */
  readonly id?: string;
  /** Where the cell centre sits in the scene. Defaults to the origin. */
  readonly position?: Vec3;
  /** Changes where organelles land; the same seed always gives the same cell. */
  readonly seed?: number;
  readonly density?: CellDensity;
}

interface Blueprint {
  readonly body: Omit<CellBody, "seed">;
  readonly nucleus: CellNucleus;
  readonly reticulumFacing: Vec3;
  readonly vacuoles: readonly Omit<CellVacuole, "id">[];
  readonly golgi: readonly Omit<CellGolgi, "id" | "axis">[];
  readonly counts: Readonly<Record<CellDensity, Readonly<Record<PlacedOrganelleKind, number>>>>;
}

/** Sizes of each scattered organelle: length along its axis, width, depth. */
export const ORGANELLE_SIZES: Readonly<Record<PlacedOrganelleKind, Vec3>> = {
  mitochondrion: { x: 0.4, y: 0.16, z: 0.16 },
  chloroplast: { x: 0.5, y: 0.22, z: 0.32 },
  lysosome: { x: 0.15, y: 0.15, z: 0.15 },
  ribosome: { x: 0.035, y: 0.035, z: 0.035 },
};

const RETICULUM_DEPTH = 0.32;
const MEMBRANE_GAP = 0.05;
const SPACING = 0.05;
const MAX_ATTEMPTS = 6000;

const BLUEPRINTS: Readonly<Record<CellKind, Blueprint>> = {
  plant: {
    body: { shape: "rounded-box", size: { x: 4.6, y: 3.2, z: 2.6 }, wallThickness: 0.14, wobble: 0 },
    nucleus: { position: { x: -1.5, y: 0.62, z: 0.25 }, radius: 0.46, nucleolusRadius: 0.16 },
    reticulumFacing: { x: 0.6, y: -0.8, z: 0 },
    vacuoles: [{ position: { x: 0.45, y: -0.08, z: 0 }, radii: { x: 1.3, y: 0.82, z: 0.6 } }],
    golgi: [{ position: { x: -1.55, y: -0.75, z: 0.2 }, size: 0.42 }],
    counts: {
      full: { chloroplast: 16, mitochondrion: 8, lysosome: 2, ribosome: 160 },
      light: { chloroplast: 12, mitochondrion: 6, lysosome: 2, ribosome: 80 },
    },
  },
  animal: {
    body: { shape: "blob", size: { x: 3.8, y: 3.2, z: 2.8 }, wallThickness: 0, wobble: 0.09 },
    nucleus: { position: { x: 0.2, y: 0.15, z: 0 }, radius: 0.6, nucleolusRadius: 0.21 },
    reticulumFacing: { x: -0.8, y: -0.6, z: 0 },
    vacuoles: [
      { position: { x: 1.15, y: -0.55, z: 0.35 }, radii: { x: 0.2, y: 0.18, z: 0.18 } },
      { position: { x: 0.65, y: 1.0, z: -0.45 }, radii: { x: 0.15, y: 0.14, z: 0.14 } },
    ],
    golgi: [{ position: { x: -0.9, y: 0.75, z: 0.2 }, size: 0.5 }],
    counts: {
      full: { chloroplast: 0, mitochondrion: 14, lysosome: 6, ribosome: 200 },
      light: { chloroplast: 0, mitochondrion: 10, lysosome: 4, ribosome: 100 },
    },
  },
};

const PLACEMENT_ORDER: readonly PlacedOrganelleKind[] = ["chloroplast", "mitochondrion", "lysosome", "ribosome"];
const DEFAULT_SEEDS: Readonly<Record<CellKind, number>> = { plant: 1907, animal: 1665 };

/**
 * Lay out a plant or animal cell: its body, nucleus, vacuoles, Golgi apparatus, and the
 * mitochondria, chloroplasts, lysosomes and ribosomes scattered through the cytoplasm.
 * Pure and deterministic: the same options always give the same layout.
 */
export function layoutCell(kind: CellKind, options: CellLayoutOptions = {}): CellLayout {
  const blueprint = BLUEPRINTS[kind];
  const seed = options.seed ?? DEFAULT_SEEDS[kind];
  const random = seededRandom(seed);
  const body: CellBody = { ...blueprint.body, seed };
  const nucleus = blueprint.nucleus;
  const vacuoles = blueprint.vacuoles.map((vacuole, index) => ({ id: `vacuole-${index + 1}`, ...vacuole }));
  const golgi = blueprint.golgi.map((stack, index) => ({
    id: `golgi-${index + 1}`,
    ...stack,
    axis: normalize(subtract(stack.position, nucleus.position)),
  }));
  const reticulum: CellReticulum = {
    facing: normalize(blueprint.reticulumFacing),
    innerRadius: nucleus.radius + 0.08,
    outerRadius: nucleus.radius + RETICULUM_DEPTH,
  };

  const counts = blueprint.counts[options.density ?? "full"];
  const placed: PlacedOrganelle[] = [];
  for (const organelle of PLACEMENT_ORDER) {
    const count = counts[organelle];
    const size = ORGANELLE_SIZES[organelle];
    const radius = boundingRadius(size);
    let made = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && made < count; attempt += 1) {
      const position = randomPointInBox(random, innerHalfExtents(body));
      if (!fitsInCell(position, radius, body, nucleus, vacuoles, golgi, placed, organelle)) continue;
      made += 1;
      placed.push({
        id: `${organelle}-${made}`,
        organelle,
        position,
        axis: randomDirection(random),
        roll: random() * Math.PI * 2,
        size,
      });
    }
  }

  return {
    id: options.id ?? kind,
    kind,
    position: options.position ?? { x: 0, y: 0, z: 0 },
    body,
    nucleus,
    reticulum,
    vacuoles,
    golgi,
    organelles: placed,
  };
}

/** Half extents of the space inside the membrane, where organelles may sit. */
export function innerHalfExtents(body: CellBody): Vec3 {
  const inset = body.wallThickness + body.wobble + MEMBRANE_GAP;
  return { x: body.size.x / 2 - inset, y: body.size.y / 2 - inset, z: body.size.z / 2 - inset };
}

/** Whether a sphere of this radius at this point sits wholly inside the cell membrane. */
export function insideMembrane(position: Vec3, radius: number, body: CellBody): boolean {
  const half = innerHalfExtents(body);
  if (body.shape === "rounded-box") {
    return Math.abs(position.x) + radius <= half.x && Math.abs(position.y) + radius <= half.y && Math.abs(position.z) + radius <= half.z;
  }
  return ellipsoidValue(position, { x: 0, y: 0, z: 0 }, {
    x: half.x - radius,
    y: half.y - radius,
    z: half.z - radius,
  }) <= 1;
}

/** Radius of the sphere that encloses an organelle of this size. */
export function boundingRadius(size: Vec3): number {
  return Math.max(size.x, size.y, size.z) / 2;
}

function fitsInCell(
  position: Vec3,
  radius: number,
  body: CellBody,
  nucleus: CellNucleus,
  vacuoles: readonly CellVacuole[],
  golgi: readonly CellGolgi[],
  placed: readonly PlacedOrganelle[],
  organelle: PlacedOrganelleKind,
): boolean {
  if (!insideMembrane(position, radius, body)) return false;
  // Ribosomes may stud the endoplasmic reticulum; everything else stays clear of it.
  const nucleusClearance = organelle === "ribosome" ? nucleus.radius + 0.06 : nucleus.radius + RETICULUM_DEPTH + SPACING;
  if (distance(position, nucleus.position) < nucleusClearance + radius) return false;
  for (const vacuole of vacuoles) {
    const grown = { x: vacuole.radii.x + radius + SPACING, y: vacuole.radii.y + radius + SPACING, z: vacuole.radii.z + radius + SPACING };
    if (ellipsoidValue(position, vacuole.position, grown) <= 1) return false;
  }
  for (const stack of golgi) {
    if (distance(position, stack.position) < stack.size / 2 + radius + SPACING) return false;
  }
  for (const other of placed) {
    if (organelle === "ribosome" && other.organelle === "ribosome") continue;
    if (distance(position, other.position) < boundingRadius(other.size) + radius + SPACING) return false;
  }
  return true;
}

function randomPointInBox(random: SeededRandom, half: Vec3): Vec3 {
  return {
    x: round((random() * 2 - 1) * half.x),
    y: round((random() * 2 - 1) * half.y),
    z: round((random() * 2 - 1) * half.z),
  };
}

function randomDirection(random: SeededRandom): Vec3 {
  for (;;) {
    const point = { x: random() * 2 - 1, y: random() * 2 - 1, z: random() * 2 - 1 };
    const length = Math.hypot(point.x, point.y, point.z);
    if (length > 0.05 && length <= 1) return normalize(point);
  }
}

function ellipsoidValue(point: Vec3, centre: Vec3, radii: Vec3): number {
  const dx = (point.x - centre.x) / radii.x;
  const dy = (point.y - centre.y) / radii.y;
  const dz = (point.z - centre.z) / radii.z;
  return dx * dx + dy * dy + dz * dz;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
