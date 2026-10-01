import { describe, expect, it } from "vitest";
import { moduleManifestSchema } from "./module-manifest.js";

const validManifest = {
  schemaVersion: "1.0",
  id: "chem.atom-builder",
  title: { en: "Atom Builder" },
  subject: "chemistry",
  kit: "chemistry",
  concepts: ["sci.chem.atom.structure"],
  boards: ["CBSE", "ICSE", "STATE"],
  levels: [
    {
      id: "class9-10",
      classes: [9, 10],
      features: ["particles", "shells"],
    },
  ],
  modes: ["screen", "ar", "vr"],
  estimatedMinutes: 8,
  assets: [{ id: "proton", src: "assets/proton.glb", budgetKB: 120 }],
  interactions: {
    manipulate: ["grab-particle"],
    simulate: ["update-element"],
    missions: ["make-na-ion"],
    check: ["assess.atom.ions.02"],
  },
  missions: [
    {
      id: "make-na-ion",
      goal: { symbol: "Na", charge: 1 },
      hints: ["A +1 ion has lost one electron."],
      onComplete: { triggerAssessment: "assess.atom.ions.02" },
    },
  ],
  rulesPlugin: "./rules/index.ts",
};

describe("moduleManifestSchema", () => {
  it("validates the module contract and retains reserved narration data", () => {
    const manifest = {
      ...validManifest,
      narration: {
        languages: ["en"],
        cues: [
          {
            id: "intro",
            trigger: "module_started",
            script: "narration/en/intro.txt",
            target: "entity:nucleus",
            interruptible: true,
          },
        ],
        guide: {
          enabled: false,
          allowedActions: ["show_hint"],
          groundingDocs: ["guide/atom-builder-knowledge.md"],
        },
      },
    };

    expect(moduleManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects a manifest with an empty interaction layer", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      interactions: { ...validManifest.interactions, simulate: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects missions that reference an assessment absent from interactions.check", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      missions: [
        {
          ...validManifest.missions[0],
          onComplete: { triggerAssessment: "assess.atom.missing.01" },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects interactions that name an undefined mission", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      interactions: {
        ...validManifest.interactions,
        missions: ["undefined-mission"],
      },
    });

    expect(result.success).toBe(false);
  });
});