import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

const narrationTriggerSchema = z.enum([
  "module_started",
  "mission_started",
  "invalid_placement",
  "mission_completed",
  "idle",
  "concept_first_seen",
]);

const guideActionSchema = z.enum([
  "highlight",
  "show_hint",
  "focus_camera",
  "open_panel",
  "start_mission",
]);

const narrationCueSchema = z
  .object({
    id: identifierSchema,
    trigger: narrationTriggerSchema,
    script: z.string().min(1),
    target: z.string().min(1).optional(),
    interruptible: z.boolean().optional(),
  })
  .strict();

const narrationSchema = z
  .object({
    languages: z.array(z.string().min(1)).min(1),
    cues: z.array(narrationCueSchema),
    guide: z
      .object({
        enabled: z.boolean(),
        allowedActions: z.array(guideActionSchema),
        groundingDocs: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const levelSchema = z
  .object({
    id: identifierSchema,
    classes: z.array(z.number().int().positive()).min(1),
    features: z.array(identifierSchema).min(1),
  })
  .strict();

const assetSchema = z
  .object({
    id: identifierSchema,
    src: z.string().min(1),
    budgetKB: z.number().positive(),
  })
  .strict();

const interactionsSchema = z
  .object({
    manipulate: z.array(identifierSchema).min(1),
    simulate: z.array(identifierSchema).min(1),
    missions: z.array(identifierSchema),
    check: z.array(identifierSchema),
  })
  .strict();

const missionSchema = z
  .object({
    id: identifierSchema,
    goal: z.record(z.string(), z.json()),
    hints: z.array(z.string()),
    onComplete: z
      .object({
        triggerAssessment: identifierSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const moduleManifestSchema = z
  .object({
    schemaVersion: z.string().min(1),
    releaseStatus: z.enum(["draft", "release"]).default("release"),
    id: identifierSchema,
    title: z
      .record(z.string().min(2), z.string().min(1))
      .refine((value) => Object.keys(value).length > 0),
    subject: identifierSchema,
    kit: identifierSchema,
    concepts: z.array(identifierSchema).min(1),
    boards: z.array(z.string().min(1)).min(1),
    levels: z.array(levelSchema).min(1),
    modes: z.array(z.enum(["screen", "ar", "vr"])).min(1),
    estimatedMinutes: z.number().int().positive(),
    assets: z.array(assetSchema),
    interactions: interactionsSchema,
    missions: z.array(missionSchema),
    rulesPlugin: z.string().min(1),
    narration: narrationSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.releaseStatus === "release") {
      if (manifest.interactions.missions.length === 0 || manifest.missions.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["interactions", "missions"],
          message: "Release modules must define a non-empty mission layer",
        });
      }

      if (manifest.interactions.check.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["interactions", "check"],
          message: "Release modules must define a non-empty check layer",
        });
      }
    }

    const assetIds = manifest.assets.map((asset) => asset.id);
    const levelIds = manifest.levels.map((level) => level.id);
    const missionIds = manifest.missions.map((mission) => mission.id);
    const interactionMissionIds = manifest.interactions.missions;

    for (const [label, ids] of [
      ["asset", assetIds],
      ["level", levelIds],
      ["mission", missionIds],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          message: `${label} IDs must be unique`,
        });
      }
    }

    if (
      interactionMissionIds.length !== missionIds.length ||
      interactionMissionIds.some((id) => !missionIds.includes(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["interactions", "missions"],
        message: "Every interaction mission must have a matching mission definition",
      });
    }

    const assessmentIds = new Set(manifest.interactions.check);
    for (const [index, mission] of manifest.missions.entries()) {
      const assessmentId = mission.onComplete?.triggerAssessment;
      if (assessmentId && !assessmentIds.has(assessmentId)) {
        context.addIssue({
          code: "custom",
          path: ["missions", index, "onComplete", "triggerAssessment"],
          message: `Assessment "${assessmentId}" is missing from interactions.check`,
        });
      }
    }
  });

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;