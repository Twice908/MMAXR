import { describe, expect, it } from "vitest";
import { createIon } from "../src/atom.js";
import {
  bohrBuryConfiguration,
  hasCompleteOuterShell,
  outerShellMessage,
  shellCapacity,
  validateElectronPlacement,
} from "../src/electron-shells.js";

describe("shell capacity and Bohr-Bury filling", () => {
  it.each([
    ["H", 1, [1]],
    ["He", 2, [2]],
    ["Li", 3, [2, 1]],
    ["Be", 4, [2, 2]],
    ["B", 5, [2, 3]],
    ["C", 6, [2, 4]],
    ["N", 7, [2, 5]],
    ["O", 8, [2, 6]],
    ["F", 9, [2, 7]],
    ["Ne", 10, [2, 8]],
    ["Na", 11, [2, 8, 1]],
    ["Mg", 12, [2, 8, 2]],
    ["Al", 13, [2, 8, 3]],
    ["Si", 14, [2, 8, 4]],
    ["P", 15, [2, 8, 5]],
    ["S", 16, [2, 8, 6]],
    ["Cl", 17, [2, 8, 7]],
    ["Ar", 18, [2, 8, 8]],
    ["K", 19, [2, 8, 8, 1]],
    ["Ca", 20, [2, 8, 8, 2]],
  ])("fills %s with the expected shell configuration", (_symbol, electrons, expected) => {
    expect(bohrBuryConfiguration(electrons as number)).toEqual(expected);
  });

  it("uses 2n^2 for theoretical capacities and caps Bohr-Bury shells at eight", () => {
    expect([1, 2, 3, 4].map(shellCapacity)).toEqual([2, 8, 18, 32]);
    expect(bohrBuryConfiguration(19)).toEqual([2, 8, 8, 1]);
    expect(bohrBuryConfiguration(20)).toEqual([2, 8, 8, 2]);
  });

  it("allows complete outer shells for atoms and ions", () => {
    const sodiumIon = createIon(11, 12, 1);
    const chlorideIon = createIon(17, 18, -1);

    expect(hasCompleteOuterShell([2])).toBe(true);
    expect(hasCompleteOuterShell([2, 8])).toBe(true);
    expect(hasCompleteOuterShell([2, 8, 8])).toBe(true);
    expect(bohrBuryConfiguration(sodiumIon.electrons)).toEqual([2, 8]);
    expect(hasCompleteOuterShell(bohrBuryConfiguration(sodiumIon.electrons))).toBe(true);
    expect(bohrBuryConfiguration(chlorideIon.electrons)).toEqual([2, 8, 8]);
    expect(hasCompleteOuterShell(bohrBuryConfiguration(chlorideIon.electrons))).toBe(true);
    expect(hasCompleteOuterShell(bohrBuryConfiguration(17))).toBe(false);
    expect(outerShellMessage([2, 8, 1])).toContain("incomplete outer shell");
    expect(outerShellMessage([2, 8, 1])).toContain("reactive");
  });

  it("explains invalid electron placements in plain English", () => {
    expect(validateElectronPlacement([1], 2)).toEqual({
      valid: false,
      message: "Fill shell 1 before adding an electron to shell 2.",
    });
    expect(validateElectronPlacement([2, 8, 8], 3)).toEqual({
      valid: false,
      message: "For elements 1-20, shell 3 holds 8 before shell 4 is used.",
    });
    expect(validateElectronPlacement([2, 8, 8], 4)).toEqual({ valid: true });
    expect(validateElectronPlacement([2, 8], 2)).toEqual({
      valid: false,
      message: "Shell 2 holds at most 8 electrons.",
    });
    expect(validateElectronPlacement([2], 5)).toEqual({
      valid: false,
      message: "Choose a shell from 1 to 4.",
    });
  });
});