import { describe, expect, it } from "vitest";
import {
  IONIC_BONDING_ACTION,
  createChemistryState,
  createIonicBondingReducer,
  createIonicBondingState,
  ionicCompoundById,
  layoutAtom,
  layoutIonicBonding,
  type IonicBondingState,
  type IonicCompound,
} from "../src/index.js";

const nacl = ionicCompoundById("nacl")!;
const mgcl2: IonicCompound = {
  id: "mgcl2",
  formula: "MgCl2",
  name: "Magnesium chloride",
  metal: { symbol: "Mg", count: 1, neutrons: 12 },
  nonMetal: { symbol: "Cl", count: 2, neutrons: 18 },
};
const reducer = createIonicBondingReducer([nacl, mgcl2]);

function apply(state: IonicBondingState, ...actions: Parameters<typeof reducer>[1][]): IonicBondingState {
  return actions.reduce((current, action) => reducer(current, action), state);
}
const transfer = (from: string, to: string) => ({ type: IONIC_BONDING_ACTION.transfer, payload: { from, to } }) as const;
const bond = { type: IONIC_BONDING_ACTION.bond, payload: null } as const;

describe("atom layout options", () => {
  it("keeps the next-shell preview by default and drops it on request", () => {
    const sodium = createChemistryState(11, 12);
    expect(layoutAtom(sodium).rings.map((ring) => ring.shell)).toEqual([1, 2, 3, 4]);
    expect(layoutAtom(sodium, { previewNextShell: false }).rings.map((ring) => ring.shell)).toEqual([1, 2, 3]);
  });
});

describe("ionic bonding layout", () => {
  it("places neutral Na and Cl side by side, centred, with no links", () => {
    const layout = layoutIonicBonding(createIonicBondingState(nacl));
    expect(layout.atoms.map((atom) => [atom.id, atom.label, atom.canGive, atom.canTake])).toEqual([
      ["na-1", "Na", true, false],
      ["cl-1", "Cl", false, true],
    ]);
    const [na, cl] = layout.atoms;
    expect(na!.position.x).toBeLessThan(0);
    expect(cl!.position.x).toBeGreaterThan(0);
    expect(na!.position.x - na!.radius).toBeCloseTo(-layout.width / 2);
    expect(cl!.position.x + cl!.radius).toBeCloseTo(layout.width / 2);
    expect(cl!.position.x - cl!.radius - (na!.position.x + na!.radius)).toBeCloseTo(1.4);
    expect(na!.labelAnchor.y).toBeGreaterThan(na!.radius);
    expect(layout.links).toEqual([]);
  });

  it("shrinks the sodium ion as its third shell empties, and links the ions", () => {
    const before = layoutIonicBonding(createIonicBondingState(nacl));
    const after = layoutIonicBonding(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1")));
    expect(after.atoms[0]!.atom.rings).toHaveLength(2);
    expect(after.atoms[0]!.radius).toBeLessThan(before.atoms[0]!.radius);
    expect(after.atoms.map((atom) => [atom.label, atom.canGive, atom.canTake])).toEqual([
      ["Na+", false, false],
      ["Cl-", false, false],
    ]);
    expect(after.links).toEqual([{ from: "na-1", to: "cl-1", kind: "attraction" }]);
  });

  it("moves the joined ions close together and marks the link as a bond", () => {
    const layout = layoutIonicBonding(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1"), bond));
    const [na, cl] = layout.atoms;
    expect(layout.bonded).toBe(true);
    expect(cl!.position.x - cl!.radius - (na!.position.x + na!.radius)).toBeCloseTo(0.2);
    expect(layout.links).toEqual([{ from: "na-1", to: "cl-1", kind: "bond" }]);
  });

  it("puts the single magnesium between the two chlorines, linking each pair", () => {
    const start = layoutIonicBonding(createIonicBondingState(mgcl2));
    expect(start.atoms.map((atom) => atom.id)).toEqual(["cl-1", "mg-1", "cl-2"]);
    const joined = layoutIonicBonding(
      apply(createIonicBondingState(mgcl2), transfer("mg-1", "cl-1"), transfer("mg-1", "cl-2"), bond),
    );
    expect(joined.atoms.map((atom) => atom.label)).toEqual(["Cl-", "Mg2+", "Cl-"]);
    expect(joined.links).toEqual([
      { from: "cl-1", to: "mg-1", kind: "bond" },
      { from: "mg-1", to: "cl-2", kind: "bond" },
    ]);
  });

  it("is deterministic", () => {
    const state = createIonicBondingState(mgcl2);
    expect(layoutIonicBonding(state)).toEqual(layoutIonicBonding(state));
  });
});
