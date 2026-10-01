import { describe, expect, it } from "vitest";
import { moduleManifestSchema, type ModuleManifest } from "@mma/schema";
import {
  assessmentItemSchema,
  resolveTriggeredAssessmentItems,
  scoreAssessmentAnswer,
  validateModuleRelease,
} from "../src/index.js";

const item = assessmentItemSchema.parse({
  id: "assess.atom.sample.01",
  prompt: "How many protons are in the supplied carbon-12 build?",
  options: [
    { id: "a", text: "12" },
    { id: "b", text: "6" },
    { id: "c", text: "0" },
    { id: "d", text: "14" },
  ],
  correctOptionIndex: 1,
  explanation: "Carbon-12 has 6 protons; the mass number is not the proton count.",
  conceptIds: ["sci.chem.atom.structure"],
  reviewStatus: "pending",
});

const manifest = moduleManifestSchema.parse({
  schemaVersion: "1.0",
  releaseStatus: "release",
  id: "chem.atom-builder",
  title: { en: "Atom Builder" },
  subject: "chemistry",
  kit: "chemistry",
  concepts: ["sci.chem.atom.structure"],
  boards: ["CBSE"],
  levels: [{ id: "class9-10", classes: [9, 10], features: ["particles"] }],
  modes: ["screen"],
  estimatedMinutes: 8,
  assets: [],
  interactions: {
    manipulate: ["drag-particles"],
    simulate: ["update-element"],
    missions: ["build-carbon"],
    check: ["assess.atom.sample.01"],
  },
  missions: [{
    id: "build-carbon",
    title: "Build carbon",
    goalText: "Build carbon with the supplied counts.",
    goal: { symbol: "C" },
    hints: ["Use the supplied target."],
    onComplete: { triggerAssessments: ["assess.atom.sample.01"] },
  }],
  rulesPlugin: "./src/index.ts",
});

describe("assessment engine", () => {
  it("scores fixed option positions and rejects out-of-range answers", () => {
    expect(scoreAssessmentAnswer(item, 1)).toMatchObject({ correct: true, correctOptionIndex: 1 });
    expect(scoreAssessmentAnswer(item, 0)).toMatchObject({ correct: false, correctOptionIndex: 1 });
    expect(() => scoreAssessmentAnswer(item, 4)).toThrow(RangeError);
  });

  it("resolves mission-linked items in the trigger order", () => {
    const second = { ...item, id: "assess.atom.sample.02" };
    expect(resolveTriggeredAssessmentItems([second.id, item.id], [item, second])).toEqual([second, item]);
    expect(() => resolveTriggeredAssessmentItems(["assess.atom.missing"], [item])).toThrow(/missing/);
  });

  it("blocks release while an assessment item is pending review", () => {
    const result = validateModuleRelease(manifest, [item]);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Assessment \"assess.atom.sample.01\" is pending review.");
  });

  it("accepts reviewed items only when all release requirements are met", () => {
    const reviewedItem = { ...item, reviewStatus: "reviewed" as const };
    expect(validateModuleRelease(manifest, [reviewedItem])).toEqual({ valid: true, issues: [] });
  });

  it("rejects release manifests with an empty layer", () => {
    const invalidManifest = {
      ...manifest,
      interactions: { ...manifest.interactions, simulate: [] },
    } as unknown as ModuleManifest;
    expect(validateModuleRelease(invalidManifest, [{ ...item, reviewStatus: "reviewed" }]).issues)
      .toContain("Release modules must have a non-empty simulate layer.");
  });
});