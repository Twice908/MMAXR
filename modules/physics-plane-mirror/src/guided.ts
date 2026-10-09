import {
  createGuidedState,
  reduceGuidedExperience,
  type ExperienceDefinition,
  type GuidedAction,
  type GuidedState,
  type TableValue,
} from "@mma/engine-guided";
import { moduleManifestSchema, type ManifestExperience } from "@mma/schema";
import rawManifest from "../module.json";
import { createPlaneMirrorState, type PlaneMirrorState } from "./learning.js";

const initialSourceDistance = createPlaneMirrorState().sourceDistance;

/** Validated plane-mirror manifest, including the structural guided walkthrough. */
export const planeMirrorManifest = moduleManifestSchema.parse(rawManifest);

const experience = planeMirrorManifest.experience;
if (!experience) {
  throw new Error("The plane-mirror manifest is missing its guided experience.");
}

/** The guided-runner definition projected from the module manifest. */
export const planeMirrorExperience: ExperienceDefinition = {
  id: planeMirrorManifest.id,
  steps: experience.steps,
};

/** Copy configured in the manifest for the guided walkthrough. */
export const planeMirrorExperienceCopy: ManifestExperience["copy"] = experience.copy;

/** Create a fresh guided state and start its basic level. */
export function createPlaneMirrorGuidedState(): GuidedState {
  const initial = createGuidedState(planeMirrorExperience);
  return reduceGuidedExperience(
    planeMirrorExperience,
    initial,
    { type: "start", level: "basic" },
    Date.now,
  ).state;
}

/** Restore a runner snapshot saved by this module, rejecting malformed stored data. */
export function restorePlaneMirrorGuidedState(value: unknown): GuidedState {
  if (!isGuidedState(value)) {
    throw new Error("Saved plane-mirror guided progress is invalid.");
  }
  return reduceGuidedExperience(
    planeMirrorExperience,
    createGuidedState(planeMirrorExperience),
    { type: "restore", snapshot: value },
    Date.now,
  ).state;
}

/** Apply a runner action using the existing guided progression rules. */
export function reducePlaneMirrorGuidedAction(
  state: GuidedState,
  action: GuidedAction,
): GuidedState {
  return reduceGuidedExperience(planeMirrorExperience, state, action, Date.now).state;
}

/** Adapt the existing scene state to the guided runner's source-moved goal. */
export function toPlaneMirrorGuidedModuleState(
  state: Readonly<PlaneMirrorState>,
): Readonly<PlaneMirrorState & { readonly sourceMoved: boolean }> {
  return {
    ...state,
    sourceMoved: state.sourceDistance !== initialSourceDistance,
  };
}

function isGuidedState(value: unknown): value is GuidedState {
  if (!isRecord(value)) {
    return false;
  }
  if (
    (value.activeLevel !== null && value.activeLevel !== "basic" && value.activeLevel !== "extended") ||
    (value.mode !== "guided" && value.mode !== "playground") ||
    (value.currentStepId !== null &&
      !planeMirrorExperience.steps.some(({ id }) => id === value.currentStepId)) ||
    !isRecord(value.steps) ||
    !isRecord(value.predictions) ||
    !isRecord(value.measurements) ||
    !isRecord(value.tableRows) ||
    typeof value.completedCount !== "number" ||
    !Number.isInteger(value.completedCount) ||
    value.completedCount < 0 ||
    (value.completedAt !== null &&
      (typeof value.completedAt !== "number" || !Number.isFinite(value.completedAt)))
  ) {
    return false;
  }

  for (const { id } of planeMirrorExperience.steps) {
    const progress = value.steps[id];
    if (
      !isRecord(progress) ||
      (progress.status !== "pending" && progress.status !== "active" && progress.status !== "done") ||
      typeof progress.attempts !== "number" ||
      !Number.isInteger(progress.attempts) ||
      progress.attempts < 0 ||
      typeof progress.hintsUsed !== "number" ||
      !Number.isInteger(progress.hintsUsed) ||
      progress.hintsUsed < 0 ||
      progress.hintsUsed > 3 ||
      !isTableValue(progress.answer)
    ) {
      return false;
    }
  }

  return Object.values(value.predictions).every((prediction) => typeof prediction === "string") &&
    Object.values(value.measurements).every(
      (measurement) => typeof measurement === "number" && Number.isFinite(measurement),
    ) &&
    Object.values(value.tableRows).every(
      (rows) => isRecord(rows) && Object.values(rows).every(isTableValue),
    );
}

function isTableValue(value: unknown): value is TableValue {
  return value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
