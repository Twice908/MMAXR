import { describe, expect, it } from "vitest";
import { buildExperienceMenuItems } from "./experience-menu.js";
import type { CatalogueEntry } from "./catalogue.js";

const catalogue: readonly CatalogueEntry[] = [
  {
    id: "chem.atom-builder",
    subject: "chemistry",
    title: "Atom Builder",
    description: "Explore atoms.",
    estimatedMinutes: 8,
    isDraft: true,
  },
  {
    id: "chem.molecule-builder",
    subject: "chemistry",
    title: "Molecule Builder",
    description: "Explore molecules.",
    estimatedMinutes: 12,
    isDraft: false,
  },
  {
    id: "physics.light",
    subject: "physics",
    title: "Light Lab",
    description: "Explore light.",
    estimatedMinutes: 10,
    isDraft: false,
  },
];

describe("experience menu items", () => {
  it("uses the subjects and current-subject catalogue entries", () => {
    expect(buildExperienceMenuItems(catalogue, catalogue[0]!)).toEqual([
      { label: "Start", route: { kind: "start" }, current: false },
      { label: "Chemistry", route: { kind: "subject", subject: "chemistry" }, current: false },
      { label: "Physics", route: { kind: "subject", subject: "physics" }, current: false },
      { label: "Biology", route: { kind: "subject", subject: "biology" }, current: false },
      { label: "Atom Builder", route: { kind: "module", moduleId: "chem.atom-builder" }, current: true },
      { label: "Molecule Builder", route: { kind: "module", moduleId: "chem.molecule-builder" }, current: false },
    ]);
  });
});
