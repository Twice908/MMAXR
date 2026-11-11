import { describe, expect, it } from "vitest";
import concepts from "../concepts.json";
import {
  conceptRegistry,
  isKnownConceptId,
  validateConceptRegistry,
} from "../src/index.js";

describe("concept registry", () => {
  it("maps chemistry to Class 9-10, electricity to Classes 10 and 12, and cells to Classes 8-10, on the three boards", () => {
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
    const cells = [
      "sci.bio.cell.structure",
      "sci.bio.cell.plant-vs-animal",
      "sci.bio.cell.mitochondria",
      "sci.bio.cell.chloroplast",
    ];
    expect(Object.keys(conceptRegistry)).toEqual([...chemistry, ...electricity, ...cells]);
    for (const [id, definition] of Object.entries(conceptRegistry)) {
      const classes = chemistry.includes(id) ? [9, 10] : cells.includes(id) ? [8, 9, 10] : [10, 12];
      expect(definition.classes).toEqual(classes);
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