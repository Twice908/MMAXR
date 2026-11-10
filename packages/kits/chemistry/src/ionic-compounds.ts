import { bohrBuryConfiguration } from "./electron-shells.js";
import { elementBySymbol } from "./elements.js";

/** One kind of atom in an ionic compound and how many of it the formula unit has. */
export interface IonicCompoundPart {
  /** Element symbol, such as "Na". Must be one of the kit's elements 1-20. */
  readonly symbol: string;
  /** Atoms of this element in one formula unit, such as 2 for the Cl in MgCl2. */
  readonly count: number;
  /** Neutrons drawn in each atom's nucleus; this does not affect bonding. */
  readonly neutrons: number;
}

/**
 * One row of the ionic compound table. The bonding rules and the live model read
 * only this data, so a new compound (for example Mg + Cl2 -> MgCl2) is a new row.
 */
export interface IonicCompound {
  /** Stable id used in state and missions, such as "nacl". */
  readonly id: string;
  /** Formula as students write it, such as "NaCl". */
  readonly formula: string;
  /** Plain name, such as "Sodium chloride". */
  readonly name: string;
  /** The element that gives away electrons and becomes a positive ion. */
  readonly metal: IonicCompoundPart;
  /** The element that takes electrons and becomes a negative ion. */
  readonly nonMetal: IonicCompoundPart;
}

/**
 * Ionic compounds available in the experiment. Version 1 ships sodium chloride only.
 * To add a compound, add a row; {@link ionicCompoundIssues} checks it.
 */
export const ionicCompounds: readonly IonicCompound[] = [
  {
    id: "nacl",
    formula: "NaCl",
    name: "Sodium chloride",
    metal: { symbol: "Na", count: 1, neutrons: 12 },
    nonMetal: { symbol: "Cl", count: 1, neutrons: 18 },
  },
];

/** Look up a compound in a table by id. */
export function ionicCompoundById(
  id: string,
  table: readonly IonicCompound[] = ionicCompounds,
): IonicCompound | undefined {
  return table.find((compound) => compound.id === id);
}

/**
 * Describe problems with a compound row; an empty list means the row can be used.
 * Besides shape checks, the electrons the metal atoms give away must equal the
 * electrons the non-metal atoms need to complete their outer shells.
 */
export function ionicCompoundIssues(compound: IonicCompound): readonly string[] {
  const issues: string[] = [];
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(compound.id)) {
    issues.push(`Compound id "${compound.id}" must be lower-case letters, digits, dots or dashes.`);
  }
  if (compound.formula.trim() === "" || compound.name.trim() === "") {
    issues.push(`Compound "${compound.id}" needs a formula and a name.`);
  }
  for (const [label, part] of [["metal", compound.metal], ["non-metal", compound.nonMetal]] as const) {
    if (!elementBySymbol(part.symbol)) {
      issues.push(`The ${label} "${part.symbol}" is not one of the kit's elements 1-20.`);
    }
    if (!Number.isInteger(part.count) || part.count < 1) {
      issues.push(`The ${label} count for ${part.symbol} must be a whole number of at least 1.`);
    }
    if (!Number.isInteger(part.neutrons) || part.neutrons < 0) {
      issues.push(`The ${label} neutrons for ${part.symbol} must be a whole number of at least 0.`);
    }
  }
  if (issues.length > 0) {
    return issues;
  }

  const given = outerElectrons(compound.metal.symbol) * compound.metal.count;
  const needed = electronsToCompleteOuterShell(compound.nonMetal.symbol) * compound.nonMetal.count;
  if (given !== needed) {
    issues.push(
      `${compound.formula}: the metal atoms give ${given} ${given === 1 ? "electron" : "electrons"} but the non-metal atoms need ${needed}.`,
    );
  }
  return issues;
}

/** Electrons in the outermost shell of a neutral atom of this element. */
export function outerElectrons(symbol: string): number {
  const shells = neutralShells(symbol);
  return shells.at(-1) ?? 0;
}

/** Electrons a neutral atom of this element must gain to complete its outer shell. */
export function electronsToCompleteOuterShell(symbol: string): number {
  const shells = neutralShells(symbol);
  const outer = shells.at(-1) ?? 0;
  const capacity = shells.length === 1 ? 2 : 8;
  return capacity - outer;
}

function neutralShells(symbol: string): readonly number[] {
  const element = elementBySymbol(symbol);
  if (!element) {
    throw new RangeError(`Unknown element symbol: ${symbol}`);
  }
  return bohrBuryConfiguration(element.atomicNumber);
}
