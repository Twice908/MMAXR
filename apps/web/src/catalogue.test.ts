import { describe, expect, it } from "vitest";
import { buildCatalogue, type CatalogueManifest } from "./catalogue.js";

const manifests: readonly CatalogueManifest[] = [
  {
    id: "chem.atoms",
    subject: "chemistry",
    title: { en: "Atoms" },
    concepts: ["chem.structure"],
    estimatedMinutes: 8,
    releaseStatus: "draft",
    missions: [{ goalText: "Explore the parts of an atom." }],
  },
  {
    id: "phys.light",
    subject: "physics",
    title: { en: "Light" },
    concepts: ["phys.light"],
    estimatedMinutes: 12,
    releaseStatus: "release",
    description: { en: "Explore how light changes direction." },
  },
  {
    id: "bio.cells",
    subject: "biology",
    title: { en: "Cells" },
    concepts: ["bio.cells"],
    estimatedMinutes: 10,
    releaseStatus: "draft",
  },
];

describe("module catalogue", () => {
  it("builds subject counts from manifest subjects", () => {
    const catalogue = buildCatalogue(manifests);
    expect(catalogue.filter(({ subject }) => subject === "chemistry")).toHaveLength(1);
    expect(catalogue.filter(({ subject }) => subject === "physics")).toHaveLength(1);
    expect(catalogue.filter(({ subject }) => subject === "biology")).toHaveLength(1);
    expect(catalogue[0]).toMatchObject({
      title: "Atoms",
      description: "Explore the parts of an atom.",
      estimatedMinutes: 8,
      isDraft: true,
    });
  });

  it("filters draft experiences when configured off", () => {
    const catalogue = buildCatalogue(manifests, false);
    expect(catalogue.map(({ id }) => id)).toEqual(["phys.light"]);
  });

  it("keeps draft experiences and marks them when configured on", () => {
    expect(buildCatalogue(manifests, true).map(({ isDraft }) => isDraft)).toEqual([true, false, true]);
  });
});
