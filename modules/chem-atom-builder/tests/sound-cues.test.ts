import { describe, expect, it } from "vitest";
import { atomMood, atomSoundEvents, COMPLETE_CHORD, electronNote, SHELL_ROOTS, type AtomSnapshot } from "../src/sound-cues.js";

const atom = (protons: number, neutrons: number, shells: number[], message = ""): AtomSnapshot => ({ protons, neutrons, shells, message });

// Shell fillings follow the Bohr-Bury examples in CLAUDE.md (Ne 2,8 complete; K 2,8,8,1 reactive).
describe("atom sounds", () => {
  it("lands protons and neutrons with their own tones", () => {
    expect(atomSoundEvents(atom(0, 0, []), atom(1, 0, [])).map((event) => event.kind)).toEqual(["place"]);
    const [neutron] = atomSoundEvents(atom(1, 0, []), atom(1, 1, []));
    expect(neutron).toMatchObject({ kind: "place", particle: "neutron" });
  });

  it("plucks the next note of the shell for each electron", () => {
    const events = atomSoundEvents(atom(3, 4, [2]), atom(3, 4, [2, 1]));
    expect(events).toEqual([{ kind: "snap", shell: 2, midi: SHELL_ROOTS[1] }]);
    expect(electronNote(2, 1)).toBeGreaterThan(electronNote(2, 0));
    expect(electronNote(1, 0)).toBeLessThan(electronNote(2, 0));
  });

  it("rings the resolved chord only when the outer shell becomes complete", () => {
    const events = atomSoundEvents(atom(10, 10, [2, 7]), atom(10, 10, [2, 8]));
    expect(events.at(-1)).toEqual({ kind: "complete", chord: COMPLETE_CHORD });
    expect(atomSoundEvents(atom(10, 10, [2, 8]), atom(10, 11, [2, 8])).some((event) => event.kind === "complete")).toBe(false);
  });

  it("answers a refused move once, and a cleared atom with one sound", () => {
    expect(atomSoundEvents(atom(1, 0, [1]), atom(1, 0, [1], "Too many"))).toEqual([{ kind: "deny" }]);
    expect(atomSoundEvents(atom(1, 0, [1], "Too many"), atom(1, 0, [1], "Too many"))).toEqual([]);
    expect(atomSoundEvents(atom(6, 6, [2, 4]), atom(0, 0, []))).toEqual([{ kind: "reset" }]);
  });

  it("moves the pad from suspended to resolved as the outer shell completes", () => {
    expect(atomMood([2, 8, 8, 1]).intervals).not.toEqual(atomMood([2, 8]).intervals);
    expect(atomMood([2, 8]).brightness).toBeGreaterThan(atomMood([2, 8, 8, 1]).brightness);
  });
});
