import { createStore } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import {
  IONIC_BONDING_ACTION,
  createIonicBondingReducer,
  createIonicBondingState,
  formatIon,
  ionicBondingCheckState,
  ionicCompoundById,
  ionicCompoundIssues,
  ionicCompounds,
  type IonicCompound,
} from "../src/index.js";

/*
 * Expected configurations and charges below are the textbook Class 9-10 values
 * (Na 2,8,1 -> Na+ 2,8; Cl 2,8,7 -> Cl- 2,8,8; Mg 2,8,2 -> Mg2+ 2,8), written out by
 * hand, not computed by the code under test. Pending teacher confirmation.
 */

const nacl = ionicCompoundById("nacl")!;
/** Test-only row: proves a 1:2 compound works from data alone. */
const mgcl2: IonicCompound = {
  id: "mgcl2",
  formula: "MgCl2",
  name: "Magnesium chloride",
  metal: { symbol: "Mg", count: 1, neutrons: 12 },
  nonMetal: { symbol: "Cl", count: 2, neutrons: 18 },
};

const transfer = (from: string, to: string) => ({ type: IONIC_BONDING_ACTION.transfer, payload: { from, to } }) as const;
const bond = { type: IONIC_BONDING_ACTION.bond, payload: null } as const;

function storeFor(compound: IonicCompound, table: readonly IonicCompound[] = [compound]) {
  return createStore(createIonicBondingReducer(table), createIonicBondingState(compound));
}

const shellsOf = (state: ReturnType<typeof createIonicBondingState>) =>
  Object.fromEntries(state.atoms.map((atom) => [atom.id, atom.atom.shells]));

describe("ionic compound table", () => {
  it("ships sodium chloride only, and every row passes its checks", () => {
    expect(ionicCompounds.map((compound) => compound.formula)).toEqual(["NaCl"]);
    for (const compound of ionicCompounds) {
      expect(ionicCompoundIssues(compound)).toEqual([]);
    }
    expect(ionicCompoundIssues(mgcl2)).toEqual([]);
  });

  it("rejects rows whose electrons do not balance or whose data is wrong", () => {
    expect(ionicCompoundIssues({ ...nacl, id: "nacl2", formula: "NaCl2", nonMetal: { ...nacl.nonMetal, count: 2 } })).toEqual([
      "NaCl2: the metal atoms give 1 electron but the non-metal atoms need 2.",
    ]);
    expect(ionicCompoundIssues({ ...nacl, metal: { symbol: "Xx", count: 0, neutrons: -1 } })).toEqual([
      'The metal "Xx" is not one of the kit\'s elements 1-20.',
      "The metal count for Xx must be a whole number of at least 1.",
      "The metal neutrons for Xx must be a whole number of at least 0.",
    ]);
    expect(() => createIonicBondingState({ ...nacl, nonMetal: { ...nacl.nonMetal, count: 2 } })).toThrow(RangeError);
  });
});

describe("ionic bonding: sodium chloride", () => {
  it("starts with neutral Na 2,8,1 and Cl 2,8,7", () => {
    const state = createIonicBondingState(nacl);
    expect(state.atoms.map((atom) => [atom.id, atom.role, atom.atom.protons, atom.atom.neutrons])).toEqual([
      ["na-1", "metal", 11, 12],
      ["cl-1", "non-metal", 17, 18],
    ]);
    expect(shellsOf(state)).toEqual({ "na-1": [2, 8, 1], "cl-1": [2, 8, 7] });
    expect(ionicBondingCheckState(state)).toEqual({
      compound: "nacl",
      formula: "NaCl",
      ions: ["Na", "Cl"],
      electronsTransferred: 0,
      allOuterShellsComplete: false,
      netCharge: 0,
      bonded: false,
    });
  });

  it("moves sodium's outer electron to chlorine, making Na+ 2,8 and Cl- 2,8,8", () => {
    const store = storeFor(nacl);
    store.dispatch(transfer("na-1", "cl-1"));
    const state = store.getState();
    expect(shellsOf(state)).toEqual({ "na-1": [2, 8], "cl-1": [2, 8, 8] });
    expect(state.validationMessages).toEqual([]);
    expect(ionicBondingCheckState(state)).toMatchObject({
      ions: ["Na+", "Cl-"],
      electronsTransferred: 1,
      allOuterShellsComplete: true,
      netCharge: 0,
    });
  });

  it("explains why wrong moves are refused and leaves the atoms unchanged", () => {
    const reducer = createIonicBondingReducer();
    const start = createIonicBondingState(nacl);
    const cases: [ReturnType<typeof transfer>, string][] = [
      [transfer("cl-1", "na-1"), "Chlorine is a non-metal. It takes electrons to complete its outer shell, so it does not give them away."],
      [transfer("na-1", "na-1"), "Move the electron to a different atom."],
      [transfer("na-1", "k-1"), "Move an electron from one atom in the model to another."],
    ];
    for (const [action, message] of cases) {
      const next = reducer(start, action);
      expect(next.validationMessages).toEqual([message]);
      expect(shellsOf(next)).toEqual(shellsOf(start));
    }
  });

  it("refuses a second electron once both outer shells are complete", () => {
    const store = storeFor(nacl);
    store.dispatch(transfer("na-1", "cl-1"));
    store.dispatch(transfer("na-1", "cl-1"));
    expect(store.getState().validationMessages).toEqual([
      "This sodium ion already has a complete outer shell (an octet). It has no outer electron left to give.",
    ]);
    expect(store.getState().electronsTransferred).toBe(1);
  });

  it("joins the ions only after the transfer, then blocks further moves until reset", () => {
    const store = storeFor(nacl);
    store.dispatch(bond);
    expect(store.getState().bonded).toBe(false);
    expect(store.getState().validationMessages).toEqual([
      "Sodium still has 1 electron in its outer shell to give away, so it is not an ion yet.",
    ]);

    store.dispatch(transfer("na-1", "cl-1"));
    store.dispatch(bond);
    expect(ionicBondingCheckState(store.getState())).toMatchObject({ bonded: true, formula: "NaCl", ions: ["Na+", "Cl-"] });

    store.dispatch(transfer("na-1", "cl-1"));
    expect(store.getState().validationMessages).toEqual(["The ions are already joined. Reset to try again."]);

    store.dispatch({ type: IONIC_BONDING_ACTION.reset, payload: null });
    expect(store.getState()).toEqual(createIonicBondingState(nacl));
  });

  it("clears a message without changing anything else", () => {
    const store = storeFor(nacl);
    store.dispatch(transfer("cl-1", "na-1"));
    store.dispatch({ type: IONIC_BONDING_ACTION.clearValidation, payload: null });
    expect(store.getState()).toEqual(createIonicBondingState(nacl));
  });
});

describe("ionic bonding from a new table row: magnesium chloride", () => {
  it("builds one Mg and two Cl atoms from the row alone", () => {
    const state = createIonicBondingState(mgcl2);
    expect(state.atoms.map((atom) => atom.id)).toEqual(["mg-1", "cl-1", "cl-2"]);
    expect(shellsOf(state)).toEqual({ "mg-1": [2, 8, 2], "cl-1": [2, 8, 7], "cl-2": [2, 8, 7] });
  });

  it("needs one electron to each chlorine before the ions can join", () => {
    const store = storeFor(mgcl2);
    store.dispatch(transfer("mg-1", "cl-1"));
    store.dispatch(transfer("mg-1", "cl-1"));
    expect(store.getState().validationMessages).toEqual([
      "This chlorine ion already has a complete outer shell (an octet). It cannot take another electron.",
    ]);
    store.dispatch(bond);
    expect(store.getState().validationMessages).toEqual([
      "Magnesium still has 1 electron in its outer shell to give away, so it is not an ion yet.",
    ]);

    store.dispatch(transfer("mg-1", "cl-2"));
    store.dispatch(bond);
    expect(shellsOf(store.getState())).toEqual({ "mg-1": [2, 8], "cl-1": [2, 8, 8], "cl-2": [2, 8, 8] });
    expect(ionicBondingCheckState(store.getState())).toMatchObject({
      ions: ["Mg2+", "Cl-", "Cl-"],
      electronsTransferred: 2,
      netCharge: 0,
      bonded: true,
      formula: "MgCl2",
    });
  });
});

describe("ion labels", () => {
  it("writes charges the way students do", () => {
    expect([formatIon("Na", 0), formatIon("Na", 1), formatIon("Mg", 2), formatIon("Cl", -1), formatIon("O", -2)]).toEqual([
      "Na",
      "Na+",
      "Mg2+",
      "Cl-",
      "O2-",
    ]);
  });
});
