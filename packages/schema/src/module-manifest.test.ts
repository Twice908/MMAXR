import { describe, expect, it } from "vitest";
import { moduleManifestSchema, type ManifestExperience } from "./module-manifest.js";
import type { ExperienceDefinition } from "../../engine-guided/src/index.js";

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

const counterExperience = {
  levels: ["basic", "extended"],
  steps: [
    {
      id: "intro",
      type: "narrate",
      titleKey: "intro-title",
      promptKey: "intro-prompt",
      cueId: "intro-cue",
      hints: ["intro-nudge", "intro-clue", "intro-explanation"],
    },
    {
      id: "predict",
      type: "predict",
      titleKey: "predict-title",
      promptKey: "predict-prompt",
      options: ["two", "three"],
      correctOptionId: "three",
      hints: ["predict-nudge", "predict-clue", "predict-explanation"],
    },
    {
      id: "adjust",
      type: "manipulate",
      titleKey: "adjust-title",
      promptKey: "adjust-prompt",
      goal: { count: 3 },
      hints: ["adjust-nudge", "adjust-clue", "adjust-explanation"],
    },
    {
      id: "measure",
      type: "measure",
      titleKey: "measure-title",
      promptKey: "measure-prompt",
      expected: 3,
      tolerance: 0,
      unit: "items",
      hints: ["measure-nudge", "measure-clue", "measure-explanation"],
    },
    {
      id: "record",
      type: "table",
      titleKey: "record-title",
      promptKey: "record-prompt",
      requiredRows: [{ id: "count-row", accepted: { kind: "number", expected: 3, tolerance: 0 } }],
      hints: ["record-nudge", "record-clue", "record-explanation"],
    },
    {
      id: "conclude",
      type: "conclude",
      titleKey: "conclude-title",
      promptKey: "conclude-prompt",
      options: ["incorrect", "correct"],
      correctOptionId: "correct",
      hints: ["conclude-nudge", "conclude-clue", "conclude-explanation"],
    },
    {
      id: "check",
      type: "check",
      titleKey: "check-title",
      promptKey: "check-prompt",
      assessmentIds: ["counter-check"],
      hints: ["check-nudge", "check-clue", "check-explanation"],
    },
  ],
  copy: Object.fromEntries(
    [
      "intro-title", "intro-prompt", "intro-nudge", "intro-clue", "intro-explanation",
      "predict-title", "predict-prompt", "two", "three", "predict-nudge", "predict-clue", "predict-explanation",
      "adjust-title", "adjust-prompt", "adjust-nudge", "adjust-clue", "adjust-explanation",
      "measure-title", "measure-prompt", "measure-nudge", "measure-clue", "measure-explanation",
      "record-title", "record-prompt", "record-nudge", "record-clue", "record-explanation",
      "conclude-title", "conclude-prompt", "incorrect", "correct", "conclude-nudge", "conclude-clue", "conclude-explanation",
      "check-title", "check-prompt", "check-nudge", "check-clue", "check-explanation",
    ].map((key) => [key, { default: key }]),
  ),
  playground: { enabled: true, tools: ["counter"] },
} as const;

const counterManifest = {
  ...validManifest,
  releaseStatus: "draft",
  experience: counterExperience,
  assessments: [{ id: "counter-check", reviewed: true }],
  narration: {
    languages: ["en"],
    cues: [{
      id: "intro-cue",
      trigger: "module_started",
      script: "intro-script",
      captionText: "Start.",
    }],
    guide: { enabled: false, allowedActions: [], groundingDocs: [] },
  },
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

  it("accepts a draft counter experience and its steps fit the guided engine API", () => {
    const parsed = moduleManifestSchema.parse(counterManifest);
    const parsedExperience: ManifestExperience = parsed.experience!;
    const guidedDefinition: ExperienceDefinition = {
      id: parsed.id,
      steps: parsedExperience.steps,
    };
    expect(guidedDefinition.steps).toHaveLength(7);
  });

  it("accepts a reviewed release experience", () => {
    const manifest = {
      ...counterManifest,
      releaseStatus: "release",
      narration: {
        ...counterManifest.narration,
        cues: [{ ...counterManifest.narration.cues[0], reviewed: true }],
      },
    };
    expect(moduleManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it.each([
    ["missing cue", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 0 ? { ...step, cueId: "missing-cue" } : step) } }],
    ["missing assessment", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 6 ? { ...step, assessmentIds: ["missing-check"] } : step) } }],
    ["missing copy key", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 0 ? { ...step, titleKey: "missing-title" } : step) } }],
    ["copy unresolved at active level", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 0 ? { ...step, level: "extended" } : step), copy: { ...counterExperience.copy, "intro-title": { basic: "Only basic" } } } }],
    ["duplicate step id", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 1 ? { ...step, id: "intro" } : step) } }],
    ["incorrect answer key", { experience: { ...counterExperience, steps: counterExperience.steps.map((step, index) => index === 1 ? { ...step, correctOptionId: "missing" } : step) } }],
  ])("rejects %s with a useful issue", (_label, patch) => {
    const result = moduleManifestSchema.safeParse({ ...counterManifest, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("blocks release while narration or assessment review is pending", () => {
    const manifest = {
      ...counterManifest,
      releaseStatus: "release",
      narration: {
        ...counterManifest.narration,
        cues: [{ ...counterManifest.narration.cues[0], reviewed: false }],
      },
      assessments: [{ id: "counter-check", reviewed: false }],
    };
    const result = moduleManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("must be reviewed"))).toBe(true);
    }
  });
});