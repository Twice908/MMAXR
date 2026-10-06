import concepts from "../concepts.json";

/** Boards supported by the initial curriculum registry. */
export type CurriculumBoard = "CBSE" | "ICSE" | "STATE";

/** Class and board coverage for one registered concept ID. */
export interface ConceptDefinition {
  readonly classes: readonly number[];
  readonly boards: readonly CurriculumBoard[];
  readonly title?: string;
  readonly description?: string;
}

/** The authoritative concept registry consumed by manifest validation. */
export const conceptRegistry = concepts as unknown as Readonly<Record<string, ConceptDefinition>>;

/** Describe structural problems in a curriculum registry; an empty result means it is valid. */
export function validateConceptRegistry(registry: unknown): readonly string[] {
  if (!isRecord(registry)) {
    return ["Concept registry must be an object"];
  }

  const errors: string[] = [];
  for (const [conceptId, definition] of Object.entries(registry)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(conceptId)) {
      errors.push(`Invalid concept ID: ${conceptId}`);
    }
    if (!isRecord(definition)) {
      errors.push(`Concept ${conceptId} must map to an object`);
      continue;
    }

    if (
      !Array.isArray(definition.classes) ||
      definition.classes.length === 0 ||
      !definition.classes.every((level) => Number.isInteger(level) && level > 0)
    ) {
      errors.push(`Concept ${conceptId} must list positive integer classes`);
    }
    if (
      !Array.isArray(definition.boards) ||
      definition.boards.length === 0 ||
      !definition.boards.every((board) => board === "CBSE" || board === "ICSE" || board === "STATE")
    ) {
      errors.push(`Concept ${conceptId} must list supported boards`);
    }
  }

  return errors;
}

/** Return whether a concept ID exists in the authoritative registry. */
export function isKnownConceptId(conceptId: string): boolean {
  return Object.hasOwn(conceptRegistry, conceptId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}