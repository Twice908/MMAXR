import { describe, expect, it } from "vitest";
import {
  calculateCharge,
  calculateMassNumber,
  createIon,
  isIsotopeOf,
} from "../src/atom.js";
import { elementBySymbol } from "../src/elements.js";

describe("atom counts, ions, and isotopes", () => {
  it("calculates sodium ion charge and mass number", () => {
    const sodiumIon = createIon(11, 12, 1);

    expect(sodiumIon).toEqual({ protons: 11, neutrons: 12, electrons: 10 });
    expect(calculateCharge(sodiumIon.protons, sodiumIon.electrons)).toBe(1);
    expect(calculateMassNumber(sodiumIon.protons, sodiumIon.neutrons)).toBe(23);
  });

  it("identifies carbon-14 as 6 protons and 8 neutrons", () => {
    const carbon14 = { protons: 6, neutrons: 8, electrons: 6 };

    expect(elementBySymbol("C")?.atomicNumber).toBe(carbon14.protons);
    expect(calculateMassNumber(carbon14.protons, carbon14.neutrons)).toBe(14);
  });

  it("recognizes isotopes as the same element with different neutron counts", () => {
    expect(
      isIsotopeOf(
        { protons: 6, neutrons: 6, electrons: 6 },
        { protons: 6, neutrons: 8, electrons: 6 },
      ),
    ).toBe(true);
    expect(
      isIsotopeOf(
        { protons: 6, neutrons: 6, electrons: 6 },
        { protons: 7, neutrons: 7, electrons: 7 },
      ),
    ).toBe(false);
  });
});