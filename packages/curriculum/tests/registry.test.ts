import { describe, expect, it } from "vitest";
import concepts from "../concepts.json";
import {
  conceptRegistry,
  isKnownConceptId,
  validateConceptRegistry,
} from "../src/index.js";

describe("concept registry", () => {
  it("maps the chemistry concepts to Class 9-10 and the electricity concepts to Classes 10 and 12, on the three boards", () => {
    expect(validateConceptRegistry(concepts)).toEqual([]);
    const chemistry = [
      "sci.chem.atom.structure",
      "sci.chem.atom.shells",
      "sci.chem.atom.ions",
      "sci.chem.atom.isotopes",
      "sci.chem.bonding.ionic",
    ];
    const electricity = [
      "sci.phys.electricity.current",
      "sci.phys.electricity.potential-difference",
      "sci.phys.electricity.resistance",
      "sci.phys.electricity.ohms-law",
      "sci.phys.electricity.meters",
      "sci.phys.electricity.non-ohmic",
    ];
    expect(Object.keys(conceptRegistry)).toEqual([...chemistry, ...electricity]);
    for (const [id, definition] of Object.entries(conceptRegistry)) {
      expect(definition.classes).toEqual(chemistry.includes(id) ? [9, 10] : [10, 12]);
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