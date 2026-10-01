import { describe, expect, it } from "vitest";
import concepts from "../concepts.json";
import {
  conceptRegistry,
  isKnownConceptId,
  validateConceptRegistry,
} from "../src/index.js";

describe("concept registry", () => {
  it("maps all requested concepts to Class 9-10 and the three boards", () => {
    expect(validateConceptRegistry(concepts)).toEqual([]);
    expect(Object.keys(conceptRegistry)).toEqual([
      "sci.chem.atom.structure",
      "sci.chem.atom.shells",
      "sci.chem.atom.ions",
      "sci.chem.atom.isotopes",
    ]);
    for (const definition of Object.values(conceptRegistry)) {
      expect(definition.classes).toEqual([9, 10]);
      expect(definition.boards).toEqual(["CBSE", "ICSE", "STATE"]);
    }
  });

  it("recognizes registered IDs and rejects unknown IDs", () => {
    expect(isKnownConceptId("sci.chem.atom.ions")).toBe(true);
    expect(isKnownConceptId("sci.chem.atom.unknown")).toBe(false);
  });

  it("reports malformed registry entries", () => {
    expect(validateConceptRegistry({ "bad ID": { classes: [], boards: ["OTHER"] } })).toEqual([
      "Invalid concept ID: bad ID",
      "Concept bad ID must list positive integer classes",
      "Concept bad ID must list supported boards",
    ]);
  });
});