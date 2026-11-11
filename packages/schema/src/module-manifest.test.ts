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
describe("journey", () => {
  const journeyManifest = (journey: unknown, extra: Record<string, unknown> = {}) => ({
    ...validManifest,
    interactions: { ...validManifest.interactions, missions: ["chapter-one", "chapter-two"] },
    missions: [
      { id: "chapter-one", title: "One", goalText: "Watch.", goal: { chapter: "one" }, hints: ["Look left."] },
      { id: "chapter-two", title: "Two", goalText: "Watch.", goal: { chapter: "two" }, hints: [] },
    ],
    narration: {
      languages: ["en"],
      cues: [{ id: "beat-cue", trigger: "journey_beat", script: "Hello.", captionText: "Hello." }],
      guide: { enabled: false, allowedActions: [], groundingDocs: [] },
    },
    journey,
    ...extra,
  });
  const chapters = [
    {
      id: "one",
      title: "One",
      missionId: "chapter-one",
      beats: [{ id: "b1", cueId: "beat-cue", shot: "wide", durationMs: 3000 }],
      checkpoint: {
        kind: "tap",
        id: "find-it",
        prompt: "Tap it.",
        explanation: "That is it.",
        defaultFeedback: "Not that one.",
        correctTargets: ["cell:plant:chloroplast"],
        wrongFeedback: { "cell:plant:vacuole": "That stores water." },
      },
    },
    {
      id: "two",
      title: "Two",
      missionId: "chapter-two",
      beats: [{ id: "b2", captionText: "Look.", durationMs: 2000 }],
      checkpoint: {
        kind: "choice",
        id: "pick-it",
        prompt: "Which?",
        explanation: "Because.",
        defaultFeedback: "Try again.",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
        correctOptionId: "a",
      },
    },
  ];

  it("accepts chapters with beats, tap and choice checkpoints", () => {
    const parsed = moduleManifestSchema.parse(journeyManifest({ chapters }));
    expect(parsed.journey?.chapters).toHaveLength(2);
    expect(parsed.journey?.chapters[1]?.checkpoint?.wrongFeedback).toEqual({});
  });

  it("rejects a beat with neither a cue nor caption text", () => {
    const bad = [{ ...chapters[0], beats: [{ id: "b1", durationMs: 1000 }] }];
    expect(moduleManifestSchema.safeParse(journeyManifest({ chapters: bad })).success).toBe(false);
  });

  it("rejects a cue that is missing or not a journey cue", () => {
    const bad = [{ ...chapters[0], beats: [{ id: "b1", cueId: "nope", durationMs: 1000 }] }];
    const result = moduleManifestSchema.safeParse(journeyManifest({ chapters: bad }));
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Journey beat needs a narration cue \"nope\" with trigger journey_beat",
    );
  });

  it("requires each chapter mission to exist and have the chapter goal", () => {
    const wrongGoal = journeyManifest({ chapters }, {
      missions: [
        { id: "chapter-one", title: "One", goalText: "Watch.", goal: { chapter: "two" }, hints: [] },
        { id: "chapter-two", title: "Two", goalText: "Watch.", goal: { chapter: "two" }, hints: [] },
      ],
    });
    expect(moduleManifestSchema.safeParse(wrongGoal).error?.issues.map((issue) => issue.message)).toContain(
      "Mission \"chapter-one\" must have the goal { \"chapter\": \"one\" }",
    );
    const missing = [{ ...chapters[0], missionId: "ghost" }, chapters[1]];
    expect(moduleManifestSchema.safeParse(journeyManifest({ chapters: missing })).success).toBe(false);
  });

  it("rejects duplicate beats, a correct option outside the options, and feedback on right answers", () => {
    const duplicate = [chapters[0], { ...chapters[1], beats: [{ id: "b1", captionText: "Again.", durationMs: 1000 }] }];
    expect(moduleManifestSchema.safeParse(journeyManifest({ chapters: duplicate })).success).toBe(false);
    const badChoice = [chapters[0], { ...chapters[1], checkpoint: { ...chapters[1]!.checkpoint, correctOptionId: "z" } }];
    expect(moduleManifestSchema.safeParse(journeyManifest({ chapters: badChoice })).success).toBe(false);
    const badTap = [{
      ...chapters[0],
      checkpoint: { ...chapters[0]!.checkpoint, wrongFeedback: { "cell:plant:chloroplast": "Wrong?" } },
    }, chapters[1]];
    expect(moduleManifestSchema.safeParse(journeyManifest({ chapters: badTap })).success).toBe(false);
  });
});
