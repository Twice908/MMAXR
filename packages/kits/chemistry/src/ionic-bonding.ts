import type { DeepReadonly, JsonValue, Reducer } from "@mma/engine-core";
import { calculateCharge } from "./atom.js";
import { hasCompleteOuterShell } from "./electron-shells.js";
import { elementBySymbol } from "./elements.js";
import {
  ionicCompoundById,
  ionicCompoundIssues,
  ionicCompounds,
  type IonicCompound,
} from "./ionic-compounds.js";
import { chemistryReducer, createChemistryState, type ChemistryState } from "./rules.js";

/** One atom (or, after a transfer, ion) in the bonding experiment. */
export interface IonicBondingAtom {
  /** Stable id such as "na-1" or "cl-2"; used for picking and drop targets. */
  readonly id: string;
  readonly symbol: string;
  readonly role: "metal" | "non-metal";
  /** The atom's particles and shells, handled by the same rules as the Atom Builder. */
  readonly atom: ChemistryState;
}

/** Serializable state of an ionic bonding experiment for one compound. */
export interface IonicBondingState {
  readonly compoundId: string;
  readonly formula: string;
  /** Metal atoms first, then non-metal atoms, in table order. */
  readonly atoms: readonly IonicBondingAtom[];
  readonly electronsTransferred: number;
  /** True once the ions have been joined into the compound. */
  readonly bonded: boolean;
  readonly validationMessages: readonly string[];
}

/** Action types handled by {@link createIonicBondingReducer}. */
export const IONIC_BONDING_ACTION = {
  transfer: "ionic/transfer-electron",
  bond: "ionic/bond",
  reset: "ionic/reset",
  clearValidation: "ionic/clear-validation",
} as const;

/** Actions that move electrons between atoms, join the ions, or reset the experiment. */
export type IonicBondingAction =
  | {
      readonly type: typeof IONIC_BONDING_ACTION.transfer;
      /** Move one outer electron from atom `from` to atom `to` (atom ids). */
      readonly payload: { readonly from: string; readonly to: string };
    }
  | { readonly type: typeof IONIC_BONDING_ACTION.bond; readonly payload: null }
  | { readonly type: typeof IONIC_BONDING_ACTION.reset; readonly payload: null }
  | { readonly type: typeof IONIC_BONDING_ACTION.clearValidation; readonly payload: null };

/** Create neutral atoms for every atom in one formula unit of the compound. */
export function createIonicBondingState(compound: IonicCompound): IonicBondingState {
  const issues = ionicCompoundIssues(compound);
  if (issues.length > 0) {
    throw new RangeError(issues.join(" "));
  }
  const atoms = [
    ...atomsFor(compound.metal, "metal"),
    ...atomsFor(compound.nonMetal, "non-metal"),
  ];
  return {
    compoundId: compound.id,
    formula: compound.formula,
    atoms,
    electronsTransferred: 0,
    bonded: false,
    validationMessages: [],
  };
}

/**
 * Create the bonding reducer. `table` is the compound table used by reset; it
 * defaults to the kit's {@link ionicCompounds}. Rejected actions leave the atoms
 * unchanged and explain why in `validationMessages`.
 */
export function createIonicBondingReducer(
  table: readonly IonicCompound[] = ionicCompounds,
): Reducer<IonicBondingState, IonicBondingAction> {
  return (state, action) => {
    switch (action.type) {
      case IONIC_BONDING_ACTION.transfer:
        return transferElectron(state, action.payload.from, action.payload.to);
      case IONIC_BONDING_ACTION.bond:
        return bondIons(state);
      case IONIC_BONDING_ACTION.reset: {
        const compound = ionicCompoundById(state.compoundId, table);
        return compound ? createIonicBondingState(compound) : reject(state, "This compound is not in the table.");
      }
      case IONIC_BONDING_ACTION.clearValidation:
        return state.validationMessages.length > 0 ? { ...state, validationMessages: [] } : state;
      default:
        return state as IonicBondingState;
    }
  };
}

/** Charge of one atom or ion: protons minus electrons. */
export function ionicAtomCharge(atom: DeepReadonly<IonicBondingAtom>): number {
  return calculateCharge(atom.atom.protons, electronCount(atom.atom.shells));
}

/** Write a symbol with its charge the way students do: "Na", "Na+", "Mg2+", "Cl-", "O2-". */
export function formatIon(symbol: string, charge: number): string {
  if (charge === 0) return symbol;
  const size = Math.abs(charge) === 1 ? "" : String(Math.abs(charge));
  return `${symbol}${size}${charge > 0 ? "+" : "-"}`;
}

/**
 * Flat record that missions compare with their goals, for example
 * `{ ions: ["Na+", "Cl-"], allOuterShellsComplete: true }` or `{ bonded: true, formula: "NaCl" }`.
 */
export function ionicBondingCheckState(state: DeepReadonly<IonicBondingState>): Readonly<Record<string, JsonValue>> {
  const charges = state.atoms.map((atom) => ionicAtomCharge(atom));
  return {
    compound: state.compoundId,
    formula: state.formula,
    ions: state.atoms.map((atom, index) => formatIon(atom.symbol, charges[index] ?? 0)),
    electronsTransferred: state.electronsTransferred,
    allOuterShellsComplete: state.atoms.every((atom) => hasCompleteOuterShell(atom.atom.shells)),
    netCharge: charges.reduce((sum, charge) => sum + charge, 0),
    bonded: state.bonded,
  };
}

function transferElectron(
  state: DeepReadonly<IonicBondingState>,
  fromId: string,
  toId: string,
): IonicBondingState {
  if (state.bonded) {
    return reject(state, "The ions are already joined. Reset to try again.");
  }
  const donor = state.atoms.find((atom) => atom.id === fromId);
  const acceptor = state.atoms.find((atom) => atom.id === toId);
  if (!donor || !acceptor) {
    return reject(state, "Move an electron from one atom in the model to another.");
  }
  if (donor.id === acceptor.id) {
    return reject(state, "Move the electron to a different atom.");
  }
  if (donor.role !== "metal") {
    return reject(
      state,
      `${elementName(donor)} is a non-metal. It takes electrons to complete its outer shell, so it does not give them away.`,
    );
  }
  if (acceptor.role !== "non-metal") {
    return reject(state, `${elementName(acceptor)} is a metal. Metals give electrons away, so move the electron to a non-metal atom.`);
  }
  if (hasCompleteOuterShell(donor.atom.shells)) {
    return reject(
      state,
      `This ${particleName(donor)} already has ${completeShellPhrase(donor.atom.shells)}. It has no outer electron left to give.`,
    );
  }
  if (hasCompleteOuterShell(acceptor.atom.shells)) {
    return reject(
      state,
      `This ${particleName(acceptor)} already has ${completeShellPhrase(acceptor.atom.shells)}. It cannot take another electron.`,
    );
  }

  const removed = chemistryReducer(donor.atom, {
    type: "electron/remove",
    payload: { shell: donor.atom.shells.length },
  });
  if (removed.validationMessages.length > 0) {
    return reject(state, removed.validationMessages[0] ?? "That electron cannot move.");
  }
  const placed = chemistryReducer(acceptor.atom, {
    type: "electron/place",
    payload: { shell: acceptor.atom.shells.length },
  });
  if (placed.validationMessages.length > 0) {
    return reject(state, placed.validationMessages[0] ?? "That shell cannot take the electron.");
  }

  return {
    ...state,
    atoms: state.atoms.map((atom) =>
      atom.id === donor.id ? { ...atom, atom: removed } : atom.id === acceptor.id ? { ...atom, atom: placed } : atom,
    ),
    electronsTransferred: state.electronsTransferred + 1,
    validationMessages: [],
  };
}

function bondIons(state: DeepReadonly<IonicBondingState>): IonicBondingState {
  if (state.bonded) {
    return reject(state, "The ions are already joined.");
  }
  for (const atom of state.atoms) {
    if (hasCompleteOuterShell(atom.atom.shells)) continue;
    const outer = atom.atom.shells.at(-1) ?? 0;
    if (atom.role === "metal") {
      return reject(
        state,
        `${elementName(atom)} still has ${electrons(outer)} in its outer shell to give away, so it is not an ion yet.`,
      );
    }
    const capacity = atom.atom.shells.length === 1 ? 2 : 8;
    return reject(
      state,
      `${elementName(atom)} needs ${electrons(capacity - outer)} more to complete its outer shell, so it is not an ion yet.`,
    );
  }
  const netCharge = state.atoms.reduce((sum, atom) => sum + ionicAtomCharge(atom), 0);
  if (netCharge !== 0) {
    return reject(state, "The positive and negative charges do not balance yet.");
  }
  return { ...state, bonded: true, validationMessages: [] };
}

function atomsFor(part: IonicCompound["metal"], role: IonicBondingAtom["role"]): IonicBondingAtom[] {
  const element = elementBySymbol(part.symbol);
  if (!element) {
    throw new RangeError(`Unknown element symbol: ${part.symbol}`);
  }
  return Array.from({ length: part.count }, (_, index) => ({
    id: `${part.symbol.toLowerCase()}-${index + 1}`,
    symbol: element.symbol,
    role,
    atom: createChemistryState(element.atomicNumber, part.neutrons),
  }));
}

function reject(state: DeepReadonly<IonicBondingState>, message: string): IonicBondingState {
  return { ...state, validationMessages: [message] } as IonicBondingState;
}

function electronCount(shells: readonly number[]): number {
  return shells.reduce((sum, count) => sum + count, 0);
}

function elementName(atom: DeepReadonly<IonicBondingAtom>): string {
  return elementBySymbol(atom.symbol)?.name ?? atom.symbol;
}

function particleName(atom: DeepReadonly<IonicBondingAtom>): string {
  return `${elementName(atom).toLowerCase()} ${ionicAtomCharge(atom) === 0 ? "atom" : "ion"}`;
}

function completeShellPhrase(shells: readonly number[]): string {
  return shells.length === 1 ? "a complete outer shell" : "a complete outer shell (an octet)";
}

function electrons(count: number): string {
  return count === 1 ? "1 electron" : `${count} electrons`;
}
