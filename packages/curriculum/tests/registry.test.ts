import { describe, expect, it } from "vitest";
import concepts from "../concepts.json";
import {
  conceptRegistry,
  isKnownConceptId,
  validateConceptRegistry,
} from "../src/index.js";

describe("concept registry", () => {
  it("maps all concepts to their configured classes and the three boards", () => {
    expect(validateConceptRegistry(concepts)).toEqual([]);
    expect(Object.keys(conceptRegistry)).toEqual([
      "sci.chem.atom.structure",
      "sci.chem.atom.shells",
      "sci.chem.atom.ions",
      "sci.chem.atom.isotopes",
      "sci.phys.light.reflection.plane",
      "sci.phys.light.image.plane",
      "sci.phys.light.mirrors.combination",
    ]);
    for (const id of Object.keys(conceptRegistry).slice(0, 4)) {
      expect(conceptRegistry[id]?.classes).toEqual([9, 10]);
    }
    for (const id of Object.keys(conceptRegistry).slice(4)) {
      expect(conceptRegistry[id]?.classes).toEqual([6]);
    }
    for (const definition of Object.values(conceptRegistry)) {
      expect(definition.boards).toEqual(["CBSE", "ICSE", "STATE"]);
    }
  });

  it("recognizes new registered IDs and rejects unknown IDs", () => {
    expect(isKnownConceptId("sci.phys.light.reflection.plane")).toBe(true);
    expect(isKnownConceptId("sci.phys.light.image.plane")).toBe(true);
    expect(isKnownConceptId("sci.phys.light.mirrors.combination")).toBe(true);
    expect(isKnownConceptId("sci.chem.atom.unknown")).toBe(false);
  });

  it("keeps concept IDs, titles, and descriptions free of standard-specific terms", () => {
    const standardSpecificTerm = /\b(std|standard|class|grade|olympiad|homi|bhabha|exam)\b/i;

    for (const [conceptId, definition] of Object.entries(conceptRegistry)) {
      expect(conceptId).not.toMatch(standardSpecificTerm);
      if (definition.title !== undefined) {
        expect(definition.title).not.toMatch(standardSpecificTerm);
      }
      if (definition.description !== undefined) {
        expect(definition.description).not.toMatch(standardSpecificTerm);
      }
    }
  });

  it("reports malformed registry entries", () => {
    expect(validateConceptRegistry({ "bad ID": { classes: [], boards: ["OTHER"] } })).toEqual([
      "Invalid concept ID: bad ID",
      "Concept bad ID must list positive integer classes",
      "Concept bad ID must list supported boards",
    ]);
  });
});