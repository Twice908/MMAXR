import { elementByAtomicNumber } from "./elements.js";

/** Proton, neutron, and electron counts for one atom or ion. */
export interface AtomComposition {
  readonly protons: number;
  readonly neutrons: number;
  readonly electrons: number;
}

/** Return the mass number, calculated as protons plus neutrons. */
export function calculateMassNumber(protons: number, neutrons: number): number {
  validateNucleus(protons, neutrons);
  return protons + neutrons;
}

/** Return the charge, calculated as protons minus electrons. */
export function calculateCharge(protons: number, electrons: number): number {
  validateProtonCount(protons);
  validateElectronCount(electrons);
  return protons - electrons;
}

/** Build an ion from its proton/neutron counts and signed charge. */
export function createIon(
  protons: number,
  neutrons: number,
  charge: number,
): AtomComposition {
  validateNucleus(protons, neutrons);
  if (!Number.isSafeInteger(charge)) {
    throw new RangeError("Charge must be a whole number.");
  }

  const electrons = protons - charge;
  validateElectronCount(electrons);
  return { protons, neutrons, electrons };
}

/** Return true when two nuclides have the same element but different neutron counts. */
export function isIsotopeOf(left: AtomComposition, right: AtomComposition): boolean {
  return left.protons === right.protons && left.neutrons !== right.neutrons;
}

function validateProtonCount(protons: number): void {
  if (!Number.isInteger(protons) || !elementByAtomicNumber(protons)) {
    throw new RangeError("This kit supports elements with 1 to 20 protons.");
  }
}

function validateElectronCount(electrons: number): void {
  if (!Number.isInteger(electrons) || electrons < 0 || electrons > 20) {
    throw new RangeError("This kit supports electron counts from 0 to 20.");
  }
}

function validateNucleus(protons: number, neutrons: number): void {
  validateProtonCount(protons);
  if (!Number.isSafeInteger(neutrons) || neutrons < 0) {
    throw new RangeError("Neutrons must be a non-negative whole number.");
  }
}

// TODO: Future task: add a curated stable-isotope table for nuclear-stability analysis.