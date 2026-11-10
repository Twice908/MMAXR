import type { DeepReadonly } from "@mma/engine-core";
import { layoutAtom, type AtomLayout, type Point3 } from "./atom-layout.js";
import { hasCompleteOuterShell } from "./electron-shells.js";
import { formatIon, ionicAtomCharge, type IonicBondingAtom, type IonicBondingState } from "./ionic-bonding.js";
import type { ChemistryState } from "./rules.js";

/** One atom or ion placed in the bonding scene. */
export interface IonicBondingLayoutAtom {
  readonly id: string;
  readonly symbol: string;
  readonly role: IonicBondingAtom["role"];
  readonly charge: number;
  /** Symbol with charge, such as "Na", "Na+" or "Cl-". */
  readonly label: string;
  /** Centre of the atom in scene units. */
  readonly position: Point3;
  /** Outer radius of the drawn atom (outer shell ring plus an electron). */
  readonly radius: number;
  /** Particles and rings around the atom's own centre. */
  readonly atom: AtomLayout;
  /** Where to show the charge label: just above the atom. */
  readonly labelAnchor: Point3;
  /** A metal with outer electrons left to give, before the ions are joined. */
  readonly canGive: boolean;
  /** A non-metal whose outer shell is not complete yet, before the ions are joined. */
  readonly canTake: boolean;
}

/** A line between two neighbouring ions with opposite charges. */
export interface IonicBondingLayoutLink {
  readonly from: string;
  readonly to: string;
  /** "attraction" before the ions are joined, "bond" after. */
  readonly kind: "attraction" | "bond";
}

/** Complete view-only geometry for the bonding scene, centred on the origin. */
export interface IonicBondingLayout {
  readonly atoms: readonly IonicBondingLayoutAtom[];
  readonly links: readonly IonicBondingLayoutLink[];
  readonly bonded: boolean;
  /** Total width of the row of atoms, for fitting the camera. */
  readonly width: number;
}

/** Space between neighbouring atoms' outer shells before and after joining. */
const SEPARATE_GAP = 1.4;
const BONDED_GAP = 0.2;
const ELECTRON_RADIUS = 0.09;
const LABEL_LIFT = 0.45;

/**
 * Derive the bonding scene from bonding state. Pure and deterministic: atoms sit in
 * a row with the scarcer element in the middle (Na Cl, Cl Mg Cl, Na O Na), and move
 * together once joined. Atom size follows the shells, so ions resize on their own.
 */
export function layoutIonicBonding(state: DeepReadonly<IonicBondingState>): IonicBondingLayout {
  const ordered = rowOrder(state.atoms);
  const sized = ordered.map((atom) => {
    const atomLayout = layoutAtom(atom.atom as ChemistryState, { previewNextShell: false });
    const outerRing = atomLayout.rings.reduce((radius, ring) => Math.max(radius, ring.radius), 0);
    return { atom, atomLayout, radius: Math.max(atomLayout.nucleusRadius, outerRing + ELECTRON_RADIUS) };
  });
  const gap = state.bonded ? BONDED_GAP : SEPARATE_GAP;
  const width = sized.reduce((sum, item) => sum + item.radius * 2, 0) + gap * Math.max(0, sized.length - 1);

  let cursor = -width / 2;
  const atoms = sized.map(({ atom, atomLayout, radius }): IonicBondingLayoutAtom => {
    const x = cursor + radius;
    cursor += radius * 2 + gap;
    const charge = ionicAtomCharge(atom);
    const complete = hasCompleteOuterShell(atom.atom.shells);
    return {
      id: atom.id,
      symbol: atom.symbol,
      role: atom.role,
      charge,
      label: formatIon(atom.symbol, charge),
      position: { x, y: 0, z: 0 },
      radius,
      atom: atomLayout,
      labelAnchor: { x, y: radius + LABEL_LIFT, z: 0 },
      canGive: !state.bonded && atom.role === "metal" && !complete,
      canTake: !state.bonded && atom.role === "non-metal" && !complete,
    };
  });

  const links: IonicBondingLayoutLink[] = [];
  for (let index = 1; index < atoms.length; index += 1) {
    const left = atoms[index - 1]!;
    const right = atoms[index]!;
    if (left.charge !== 0 && right.charge !== 0 && Math.sign(left.charge) !== Math.sign(right.charge)) {
      links.push({ from: left.id, to: right.id, kind: state.bonded ? "bond" : "attraction" });
    }
  }

  return { atoms, links, bonded: state.bonded, width };
}

/** Put the element with fewer atoms in the middle of the row, split the other around it. */
function rowOrder<Atom extends DeepReadonly<IonicBondingAtom>>(atoms: readonly Atom[]): Atom[] {
  const metals = atoms.filter((atom) => atom.role === "metal");
  const nonMetals = atoms.filter((atom) => atom.role === "non-metal");
  if (metals.length === nonMetals.length) {
    return metals.flatMap((metal, index) => [metal, nonMetals[index]!]);
  }
  const [middle, outer] = metals.length < nonMetals.length ? [metals, nonMetals] : [nonMetals, metals];
  const before = Math.floor(outer.length / 2);
  return [...outer.slice(0, before), ...middle, ...outer.slice(before)];
}
