import type { ChemistryState } from "@mma/kit-chemistry";

/** Read-only point in the module's derived 3D layout. */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A color-coded, instanced group of atom particles. */
export interface SphereGroup {
  readonly id: "proton" | "neutron" | "electron";
  readonly color: number;
  readonly radius: number;
  readonly interactionTarget: string | null;
  readonly positions: readonly Point3[];
}

/** Radius and shell number for one electron ring. */
export interface RingLayout {
  readonly shell: number;
  readonly radius: number;
}

/** Complete view-only geometry derived from chemistry state. */
export interface AtomLayout {
  readonly nucleusRadius: number;
  readonly spheres: readonly SphereGroup[];
  readonly rings: readonly RingLayout[];
}

const NUCLEON_RADIUS = 0.18;
const ELECTRON_RADIUS = 0.09;
const FCC_SPACING = NUCLEON_RADIUS * 2 * Math.SQRT2;
/** Derive a deterministic, view-only 3D layout from chemistry state. */
export function layoutAtom(state: ChemistryState): AtomLayout {
  const nucleonCount = state.protons + state.neutrons;
  const packedNucleons = packedPositions(nucleonCount);
  const protonPositions = packedNucleons.slice(0, state.protons);
  const neutronPositions = packedNucleons.slice(state.protons);
  const nucleusRadius = packedNucleons.reduce(
    (radius, point) => Math.max(radius, Math.hypot(point.x, point.y, point.z) + NUCLEON_RADIUS),
    NUCLEON_RADIUS,
  );
  const electronCount = state.shells.reduce((total, count) => total + count, 0);
  const previewNextShell = electronCount < 20 ? 1 : 0;
  const shellCount = Math.min(4, Math.max(1, state.shells.length + previewNextShell));
  const rings = Array.from({ length: shellCount }, (_, index) => ({
    shell: index + 1,
    radius: nucleusRadius + 0.65 + index * 0.68,
  }));
  const electrons: Point3[] = [];
  state.shells.forEach((count, shellIndex) => {
    const ring = rings[shellIndex];
    if (!ring) {
      return;
    }
    for (let index = 0; index < count; index += 1) {
      const angle = (2 * Math.PI * index) / count - Math.PI / 2;
      electrons.push({
        x: Math.cos(angle) * ring.radius,
        y: Math.sin(angle) * ring.radius,
        z: 0,
      });
    }
  });

  return {
    nucleusRadius,
    spheres: [
      {
        id: "proton",
        color: 0xd64c35,
        radius: NUCLEON_RADIUS,
        interactionTarget: "nucleus",
        positions: protonPositions,
      },
      {
        id: "neutron",
        color: 0x287f83,
        radius: NUCLEON_RADIUS,
        interactionTarget: "nucleus",
        positions: neutronPositions,
      },
      {
        id: "electron",
        color: 0xf0b323,
        radius: ELECTRON_RADIUS,
        interactionTarget: null,
        positions: electrons,
      },
    ],
    rings,
  };
}

function packedPositions(count: number): Point3[] {
  if (count <= 0) {
    return [];
  }

  const extent = Math.ceil(Math.cbrt(count) * 2);
  const sites: Point3[] = [];
  for (let x = -extent; x <= extent; x += 1) {
    for (let y = -extent; y <= extent; y += 1) {
      for (let z = -extent; z <= extent; z += 1) {
        if ((x + y + z) % 2 === 0) {
          sites.push({ x: x * FCC_SPACING, y: y * FCC_SPACING, z: z * FCC_SPACING });
        }
      }
    }
  }

  sites.sort((left, right) =>
    Math.hypot(left.x, left.y, left.z) - Math.hypot(right.x, right.y, right.z) ||
    left.x - right.x || left.y - right.y || left.z - right.z,
  );
  const selected = sites.slice(0, count);
  const center = selected.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count, z: sum.z + point.z / count }),
    { x: 0, y: 0, z: 0 },
  );
  const growth = 1 + 0.12 * (Math.cbrt(count) - 1);

  return selected.map((point) => ({
    x: (point.x - center.x) * growth,
    y: (point.y - center.y) * growth,
    z: (point.z - center.z) * growth,
  }));
}