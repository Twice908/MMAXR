import { describe, expect, it } from "vitest";
import {
  ORGANELLES,
  groupOrganelles,
  isPresentIn,
  organelleById,
  organellePart,
  organellesIn,
  teachableOrganelles,
} from "../src/index.js";

// Presence values below are the table the owner approved on 2026-11-11.
describe("organelle table", () => {
  it("lists each organelle once and has no centrosome", () => {
    const ids = ORGANELLES.map((organelle) => organelle.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("centrosome");
    expect(ids).toContain("lysosome");
  });

  it("puts the cell wall and chloroplasts in plant cells only", () => {
    expect(isPresentIn("cell-wall", "plant")).toBe(true);
    expect(isPresentIn("cell-wall", "animal")).toBe(false);
    expect(isPresentIn("chloroplast", "plant")).toBe(true);
    expect(isPresentIn("chloroplast", "animal")).toBe(false);
  });

  it("puts mitochondria, the nucleus and lysosomes in both cells", () => {
    for (const id of ["mitochondrion", "nucleus", "lysosome", "cell-membrane"] as const) {
      expect(isPresentIn(id, "plant")).toBe(true);
      expect(isPresentIn(id, "animal")).toBe(true);
    }
  });

  it("notes the vacuole difference", () => {
    expect(organelleById("vacuole").presence.plant.note).toBe("one large central vacuole");
    expect(organelleById("vacuole").presence.animal.note).toBe("small and few");
  });

  it("teaches mitochondria and chloroplasts first, with their approved part labels", () => {
    expect(teachableOrganelles().map((organelle) => organelle.id)).toEqual(["mitochondrion", "chloroplast"]);
    expect(organelleById("mitochondrion").parts.map((part) => part.name)).toEqual([
      "Outer membrane",
      "Inner membrane",
      "Cristae",
      "Matrix",
    ]);
    expect(organelleById("chloroplast").parts.map((part) => part.name)).toEqual([
      "Outer membrane",
      "Inner membrane",
      "Grana",
      "Stroma",
    ]);
    expect(organellePart("chloroplast", "grana")?.note).toBe("stacks of thylakoids");
    expect(organellePart("mitochondrion", "grana")).toBeNull();
  });

  it("keeps every entry pending until the teacher reviews it", () => {
    expect(ORGANELLES.every((organelle) => organelle.reviewStatus === "pending")).toBe(true);
  });

  it("filters by cell kind and sorts into plant only, animal only and both", () => {
    expect(organellesIn("animal").map((organelle) => organelle.id)).not.toContain("chloroplast");
    const groups = groupOrganelles();
    expect(groups.plantOnly).toEqual(["cell-wall", "chloroplast"]);
    expect(groups.animalOnly).toEqual([]);
    expect(groups.both).toContain("mitochondrion");
    expect(groups.plantOnly.length + groups.animalOnly.length + groups.both.length).toBe(ORGANELLES.length);
  });

  it("throws for an unknown id", () => {
    expect(() => organelleById("centrosome" as never)).toThrow(/Unknown organelle/);
  });
});
