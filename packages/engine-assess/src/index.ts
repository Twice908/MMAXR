import { isKnownConceptId } from "@mma/curriculum";
import type { ModuleManifest } from "@mma/schema";
import { z } from "zod";

const identifierSchema = z.string().min(1).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const optionSchema = z.object({
  id: identifierSchema,
  text: z.string().min(1),
}).strict();

/** Schema for a fixed-order multiple-choice item linked to curriculum concepts. */
export const assessmentItemSchema = z.object({
  id: identifierSchema,
  prompt: z.string().min(1),
  options: z.tuple([optionSchema, optionSchema, optionSchema, optionSchema]),
  correctOptionIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  conceptIds: z.array(identifierSchema).min(1),
  reviewStatus: z.enum(["pending", "reviewed"]),
}).strict().superRefine((item, context) => {
  const optionIds = item.options.map((option) => option.id);
  if (new Set(optionIds).size !== optionIds.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique" });
  }
  for (const [index, conceptId] of item.conceptIds.entries()) {
    if (!isKnownConceptId(conceptId)) {
      context.addIssue({
        code: "custom",
        path: ["conceptIds", index],
        message: `Unknown concept ID: ${conceptId}`,
      });
    }
  }
});

/** A validated multiple-choice assessment item. */
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;

/** Result of scoring a selected fixed option index. */
export interface AssessmentResult {
  readonly assessmentId: string;
  readonly selectedOptionIndex: number;
  readonly correct: boolean;
  readonly correctOptionIndex: number;
  readonly explanation: string;
}

/** Score one answer without changing the item or its option order. */
export function scoreAssessmentAnswer(
  item: AssessmentItem,
  selectedOptionIndex: number,
): AssessmentResult {
  if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex > 3) {
    throw new RangeError("Selected option index must be between 0 and 3.");
  }
  return {
    assessmentId: item.id,
    selectedOptionIndex,
    correct: selectedOptionIndex === item.correctOptionIndex,
    correctOptionIndex: item.correctOptionIndex,
    explanation: item.explanation,
  };
}

/** Resolve mission-linked assessment item IDs in the order stored in the mission. */
export function resolveTriggeredAssessmentItems(
  assessmentIds: readonly string[],
  items: readonly AssessmentItem[],
): readonly AssessmentItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return assessmentIds.map((assessmentId) => {
    const item = byId.get(assessmentId);
    if (!item) {
      throw new Error(`Triggered assessment "${assessmentId}" is missing.`);
    }
    return item;
  });
}

/** Release validation result; every issue explains one unmet publishing requirement. */
export interface ModuleReleaseValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Require a released manifest, all four interaction layers, known concepts, and reviewed items. */
export function validateModuleRelease(
  manifest: ModuleManifest,
  rawAssessmentItems: readonly unknown[],
): ModuleReleaseValidation {
  const issues: string[] = [];
  if (manifest.releaseStatus !== "release") {
    issues.push("Module releaseStatus must be release.");
  }

  for (const layer of ["manipulate", "simulate", "missions", "check"] as const) {
    if (manifest.interactions[layer].length === 0) {
      issues.push(`Release modules must have a non-empty ${layer} layer.`);
    }
  }

  for (const conceptId of manifest.concepts) {
    if (!isKnownConceptId(conceptId)) {
      issues.push(`Unknown concept ID: ${conceptId}`);
    }
  }

  const parsedItems: AssessmentItem[] = [];
  for (const [index, rawItem] of rawAssessmentItems.entries()) {
    const parsed = assessmentItemSchema.safeParse(rawItem);
    if (parsed.success) {
      parsedItems.push(parsed.data);
    } else {
      issues.push(`Assessment item ${index + 1} is invalid: ${parsed.error.issues[0]?.message ?? "invalid item"}`);
    }
  }

  const itemIds = parsedItems.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) {
    issues.push("Assessment item IDs must be unique.");
  }
  for (const assessmentId of manifest.interactions.check) {
    if (!itemIds.includes(assessmentId)) {
      issues.push(`Assessment "${assessmentId}" has no item data.`);
    }
  }
  for (const item of parsedItems) {
    if (item.reviewStatus !== "reviewed") {
      issues.push(`Assessment "${item.id}" is pending review.`);
    }
  }

  return { valid: issues.length === 0, issues };
}