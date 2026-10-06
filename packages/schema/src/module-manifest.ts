import { z } from "zod";
import { isKnownConceptId } from "@mma/curriculum";

const identifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

const narrationTriggerSchema = z.enum([
  "module_started",
  "mission_started",
  "invalid_placement",
  "mission_completed",
  "hint_used",
  "idle",
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
    missionId: identifierSchema.optional(),
    target: z.string().min(1).optional(),
    interruptible: z.boolean().optional(),
    audio: z.string().min(1).optional(),
    fallbackAudio: z.string().min(1).optional(),
    captions: z.string().min(1).optional(),
    captionText: z.string().min(1).optional(),
    reviewed: z.boolean().optional(),
  })
  .strict()
  .refine((cue) => cue.captions !== undefined || cue.captionText !== undefined, {
    message: "Every narration cue must define a captions file or caption text",
  });

const narrationSchema = z
  .object({
    languages: z.array(z.string().min(1)).min(1),
    cues: z.array(narrationCueSchema),
    guide: z
      .object({
        enabled: z.literal(false),
        allowedActions: z.array(guideActionSchema),
        groundingDocs: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const levelSchema = z
  .object({
    id: identifierSchema,
    classes: z.array(z.number().int().positive()).min(1).optional(),
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
    title: z.string().min(1),
    goalText: z.string().min(1),
    goal: z.record(z.string(), z.json()),
    hints: z.array(z.string()),
    onComplete: z
      .object({
        triggerAssessments: z.array(identifierSchema).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

const experienceLevelSchema = z.enum(["basic", "extended"]);
const copyValueSchema = z
  .object({
    default: z.string().min(1).optional(),
    basic: z.string().min(1).optional(),
    extended: z.string().min(1).optional(),
  })
  .strict()
  .refine((value) => value.default !== undefined || value.basic !== undefined || value.extended !== undefined, {
    message: "Copy entries must define at least one text variant",
  });

const experienceStepBaseSchema = z.object({
  id: identifierSchema,
  titleKey: identifierSchema,
  promptKey: identifierSchema,
  level: experienceLevelSchema.optional(),
  cueId: identifierSchema.optional(),
  hints: z.tuple([identifierSchema, identifierSchema, identifierSchema]),
});

const acceptedValueRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("one_of"), values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])) }).strict(),
  z.object({ kind: z.literal("number"), expected: z.number(), tolerance: z.number().nonnegative() }).strict(),
]);

const experienceStepSchema = z.discriminatedUnion("type", [
  experienceStepBaseSchema.extend({ type: z.literal("narrate") }).strict(),
  experienceStepBaseSchema
    .extend({
      type: z.literal("predict"),
      options: z.array(identifierSchema).min(1),
      correctOptionId: identifierSchema,
    })
    .strict(),
  experienceStepBaseSchema
    .extend({ type: z.literal("manipulate"), goal: z.record(z.string(), z.json()) })
    .strict()
    .refine((step) => Object.keys(step.goal).length > 0, {
      message: "Manipulate goal must not be empty",
    }),
  experienceStepBaseSchema
    .extend({
      type: z.literal("measure"),
      expected: z.number(),
      tolerance: z.number().nonnegative(),
      unit: z.string().min(1),
    })
    .strict(),
  experienceStepBaseSchema
    .extend({
      type: z.literal("table"),
      requiredRows: z
        .array(z.object({ id: identifierSchema, accepted: acceptedValueRuleSchema }).strict())
        .min(1),
    })
    .strict(),
  experienceStepBaseSchema
    .extend({
      type: z.literal("conclude"),
      options: z.array(identifierSchema).min(1),
      correctOptionId: identifierSchema,
    })
    .strict(),
  experienceStepBaseSchema
    .extend({ type: z.literal("check"), assessmentIds: z.array(identifierSchema).min(1) })
    .strict(),
]).superRefine((step, context) => {
  if ((step.type === "predict" || step.type === "conclude") && !step.options.includes(step.correctOptionId)) {
    context.addIssue({
      code: "custom",
      path: ["correctOptionId"],
      message: `Step "${step.id}" correctOptionId must be one of its options`,
    });
  }
});

export const experienceSchema = z
  .object({
    levels: z.array(experienceLevelSchema).min(1),
    steps: z.array(experienceStepSchema).min(1),
    copy: z.record(identifierSchema, copyValueSchema),
    playground: z.object({ enabled: z.boolean(), tools: z.array(z.string()) }).strict(),
  })
  .strict();

const assessmentItemSchema = z.object({ id: identifierSchema, reviewed: z.boolean() }).strict();

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
    assessments: z.array(assessmentItemSchema).optional(),
    experience: experienceSchema.optional(),
    rulesPlugin: z.string().min(1),
    narration: narrationSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const [index, conceptId] of manifest.concepts.entries()) {
      if (!isKnownConceptId(conceptId)) {
        context.addIssue({
          code: "custom",
          path: ["concepts", index],
          message: `Unknown concept ID: ${conceptId}`,
        });
      }
    }

    if (manifest.releaseStatus === "release" && manifest.experience === undefined) {
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

    if (manifest.narration) {
      const cueIds = manifest.narration.cues.map((cue) => cue.id);
      if (new Set(cueIds).size !== cueIds.length) {
        context.addIssue({
          code: "custom",
          path: ["narration", "cues"],
          message: "Narration cue IDs must be unique",
        });
      }

      if (manifest.experience) {
        const experience = manifest.experience;
        const assessmentIds = new Set((manifest.assessments ?? []).map(({ id }) => id));
        const cueIds = new Set(manifest.narration?.cues.map(({ id }) => id) ?? []);
        if (new Set(experience.levels).size !== experience.levels.length) {
          context.addIssue({
            code: "custom",
            path: ["experience", "levels"],
            message: "Experience level values must be unique",
          });
        }
        const seenStepIds = new Set<string>();
        for (const [stepIndex, step] of experience.steps.entries()) {
          const stepPath = ["experience", "steps", stepIndex];
          if (seenStepIds.has(step.id)) {
            context.addIssue({
              code: "custom",
              path: [...stepPath, "id"],
              message: `Step "${step.id}" has a duplicate ID`,
            });
          }
          seenStepIds.add(step.id);
          if (step.level !== undefined && !experience.levels.includes(step.level)) {
            context.addIssue({
              code: "custom",
              path: [...stepPath, "level"],
              message: `Step "${step.id}" uses a level not declared by the experience`,
            });
          }
          if (step.cueId !== undefined && !cueIds.has(step.cueId)) {
            context.addIssue({
              code: "custom",
              path: [...stepPath, "cueId"],
              message: `Step "${step.id}" references missing narration cue "${step.cueId}"`,
            });
          }
          if (step.type === "check") {
            for (const assessmentId of step.assessmentIds) {
              if (!assessmentIds.has(assessmentId)) {
                context.addIssue({
                  code: "custom",
                  path: [...stepPath, "assessmentIds"],
                  message: `Step "${step.id}" references missing assessment "${assessmentId}"`,
                });
              }
            }
          }

          const keys = [
            step.titleKey,
            step.promptKey,
            ...step.hints,
            ...(step.type === "predict" || step.type === "conclude" ? step.options : []),
          ];
          const activeLevels =
            step.level === undefined ? experience.levels : [step.level];
          for (const key of keys) {
            const value = experience.copy[key];
            if (value === undefined) {
              context.addIssue({
                code: "custom",
                path: [...stepPath],
                message: `Step "${step.id}" references missing copy key "${key}"`,
              });
              continue;
            }
            for (const level of activeLevels) {
              if (value[level] === undefined && value.default === undefined) {
                context.addIssue({
                  code: "custom",
                  path: ["experience", "copy", key],
                  message: `Step "${step.id}" copy key "${key}" has no text for level "${level}"`,
                });
              }
            }
          }
        }

        if (manifest.releaseStatus === "release") {
          if (!experience.playground.enabled) {
            context.addIssue({
              code: "custom",
              path: ["experience", "playground", "enabled"],
              message: "Release experiences must enable playground mode",
            });
          }
          if (
            !experience.steps.some(({ type }) =>
              type === "manipulate" || type === "predict" || type === "measure",
            )
          ) {
            context.addIssue({
              code: "custom",
              path: ["experience", "steps"],
              message: "Release experiences must define a Mission-layer step",
            });
          }
          if (!experience.steps.some(({ type }) => type === "check")) {
            context.addIssue({
              code: "custom",
              path: ["experience", "steps"],
              message: "Release experiences must define a Check-layer step",
            });
          }
          for (const [index, cue] of (manifest.narration?.cues ?? []).entries()) {
            if (cue.reviewed !== true) {
              context.addIssue({
                code: "custom",
                path: ["narration", "cues", index, "reviewed"],
                message: `Narration cue "${cue.id}" must be reviewed for release`,
              });
            }
          }
          for (const [index, assessment] of (manifest.assessments ?? []).entries()) {
            if (!assessment.reviewed) {
              context.addIssue({
                code: "custom",
                path: ["assessments", index, "reviewed"],
                message: `Assessment "${assessment.id}" must be reviewed for release`,
              });
            }
          }
        }
      }
      for (const [index, cue] of manifest.narration.cues.entries()) {
        if (cue.missionId && !missionIds.includes(cue.missionId)) {
          context.addIssue({
            code: "custom",
            path: ["narration", "cues", index, "missionId"],
            message: `Narration cue references missing mission "${cue.missionId}"`,
          });
        }
        if (cue.missionId && cue.trigger !== "mission_started" && cue.trigger !== "mission_completed") {
          context.addIssue({
            code: "custom",
            path: ["narration", "cues", index, "missionId"],
            message: "missionId is only valid for mission start or completion cues",
          });
        }
      }
    }

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
      for (const assessmentId of mission.onComplete?.triggerAssessments ?? []) {
        if (!assessmentIds.has(assessmentId)) {
          context.addIssue({
            code: "custom",
            path: ["missions", index, "onComplete", "triggerAssessments"],
            message: `Assessment "${assessmentId}" is missing from interactions.check`,
          });
        }
      }
    }
  });

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;
export type ManifestExperience = z.infer<typeof experienceSchema>;