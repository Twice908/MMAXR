import { describe, expect, it } from "vitest";
import { moduleManifestSchema } from "./module-manifest.js";

const validManifest = {
  schemaVersion: "1.0",
  releaseStatus: "release",
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
      title: "Make Na+",
      goalText: "Build a sodium ion with a +1 charge.",
      goal: { symbol: "Na", charge: 1 },
      hints: ["A +1 ion has lost one electron."],
      onComplete: { triggerAssessments: ["assess.atom.ions.02"] },
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
            captionText: "Welcome to the lesson.",
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

  it("allows a draft manifest with empty mission and check layers", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      releaseStatus: "draft",
      interactions: {
        ...validManifest.interactions,
        missions: [],
        check: [],
      },
      missions: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects release manifests with empty mission and check layers", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      interactions: {
        ...validManifest.interactions,
        missions: [],
        check: [],
      },
      missions: [],
    });

    expect(result.success).toBe(false);
  });

  it("defaults an omitted release status to release", () => {
    const manifestWithoutStatus: Record<string, unknown> = { ...validManifest };
    delete manifestWithoutStatus.releaseStatus;

    expect(moduleManifestSchema.parse(manifestWithoutStatus).releaseStatus).toBe("release");
  });

  it("rejects missions that reference an assessment absent from interactions.check", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      missions: [
        {
          ...validManifest.missions[0],
          onComplete: { triggerAssessments: ["assess.atom.missing.01"] },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown curriculum concept IDs", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      concepts: ["sci.chem.atom.not-registered"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Unknown concept ID"))).toBe(true);
    }
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

  it("requires cue captions and keeps the reserved guide disabled", () => {
    const narration = {
      languages: ["en"],
      cues: [{ id: "intro", trigger: "module_started", script: "narration/en/intro.json" }],
      guide: { enabled: false, allowedActions: [], groundingDocs: [] },
    };
    expect(moduleManifestSchema.safeParse({ ...validManifest, narration }).success).toBe(false);
    expect(moduleManifestSchema.safeParse({
      ...validManifest,
      narration: {
        ...narration,
        cues: [{ ...narration.cues[0], captionText: "Welcome." }],
        guide: { ...narration.guide, enabled: true },
      },
    }).success).toBe(false);
  });

  it("validates mission-specific narration cue references", () => {
    const result = moduleManifestSchema.safeParse({
      ...validManifest,
      narration: {
        languages: ["en"],
        cues: [{
          id: "sodium-start",
          trigger: "mission_started",
          missionId: "missing-mission",
          script: "narration/en/sodium-start.json",
          captionText: "Start the mission.",
        }],
        guide: { enabled: false, allowedActions: [], groundingDocs: [] },
      },
    });

    expect(result.success).toBe(false);
  });
});