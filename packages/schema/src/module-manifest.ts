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
  // Played by a journey beat (see `journey`), never by a learning event.
  "journey_beat",
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

const journeyBeatSchema = z
  .object({
    id: identifierSchema,
    /** Narration cue (trigger `journey_beat`) spoken during the beat. */
    cueId: identifierSchema.optional(),
    /** Short on-screen line; required when the beat has no cue. */
    captionText: z.string().min(1).optional(),
    /** Camera shot id, defined by the module. */
    shot: identifierSchema.optional(),
    /** Pick target to highlight during the beat. */
    highlight: z.string().min(1).optional(),
    /** How long the beat lasts when no narration audio plays. */
    durationMs: z.number().int().positive(),
  })
  .strict()
  .refine((beat) => beat.cueId !== undefined || beat.captionText !== undefined, {
    message: "Every journey beat must define a narration cue or caption text",
  });

const checkpointCommon = {
  id: identifierSchema,
  prompt: z.string().min(1),
  /** Shown once the checkpoint is solved: why the answer is right. */
  explanation: z.string().min(1),
  /** Shown for a wrong answer that has no specific feedback. */
  defaultFeedback: z.string().min(1),
  /** Why a specific wrong answer (tap target or option id) is wrong. */
  wrongFeedback: z.record(z.string().min(1), z.string().min(1)).default({}),
};

const journeyCheckpointSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tap"),
      ...checkpointCommon,
      /** Pick targets that answer the checkpoint. */
      correctTargets: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("choice"),
      ...checkpointCommon,
      options: z
        .array(z.object({ id: identifierSchema, text: z.string().min(1) }).strict())
        .min(2)
        .max(4),
      correctOptionId: identifierSchema,
    })
    .strict(),
]);

const journeyChapterSchema = z
  .object({
    id: identifierSchema,
    title: z.string().min(1),
    /** Mission tracked for this chapter; its goal must be `{ "chapter": "<chapter id>" }`. */
    missionId: identifierSchema,
    beats: z.array(journeyBeatSchema).min(1),
    checkpoint: journeyCheckpointSchema.optional(),
  })
  .strict();

const journeySchema = z
  .object({
    chapters: z.array(journeyChapterSchema).min(1),
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
    journey: journeySchema.optional(),
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

    if (manifest.narration) {
      const cueIds = manifest.narration.cues.map((cue) => cue.id);
      if (new Set(cueIds).size !== cueIds.length) {
        context.addIssue({
          code: "custom",
          path: ["narration", "cues"],
          message: "Narration cue IDs must be unique",
        });
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

    if (manifest.journey) {
      const cues = new Map((manifest.narration?.cues ?? []).map((cue) => [cue.id, cue]));
      const missionsById = new Map(manifest.missions.map((mission) => [mission.id, mission]));
      const chapterIds = manifest.journey.chapters.map((chapter) => chapter.id);
      const beatIds = manifest.journey.chapters.flatMap((chapter) => chapter.beats.map((beat) => beat.id));
      const chapterMissions = manifest.journey.chapters.map((chapter) => chapter.missionId);
      for (const [label, ids] of [["chapter", chapterIds], ["beat", beatIds], ["chapter mission", chapterMissions]] as const) {
        if (new Set(ids).size !== ids.length) {
          context.addIssue({ code: "custom", path: ["journey", "chapters"], message: `Journey ${label} IDs must be unique` });
        }
      }
      // The lesson flow starts the next mission in manifest order after scored questions.
      const missionOrder = manifest.missions.map((mission) => mission.id).filter((id) => chapterMissions.includes(id));
      if (missionOrder.join() !== chapterMissions.join()) {
        context.addIssue({ code: "custom", path: ["journey", "chapters"], message: "Journey chapters must follow the order of their missions" });
      }
      for (const [chapterIndex, chapter] of manifest.journey.chapters.entries()) {
        const path = ["journey", "chapters", chapterIndex];
        const mission = missionsById.get(chapter.missionId);
        if (!mission) {
          context.addIssue({ code: "custom", path: [...path, "missionId"], message: `Journey chapter references missing mission "${chapter.missionId}"` });
        } else if (JSON.stringify(mission.goal) !== JSON.stringify({ chapter: chapter.id })) {
          context.addIssue({
            code: "custom",
            path: [...path, "missionId"],
            message: `Mission "${mission.id}" must have the goal { "chapter": "${chapter.id}" }`,
          });
        }
        for (const [beatIndex, beat] of chapter.beats.entries()) {
          if (beat.cueId === undefined) continue;
          const cue = cues.get(beat.cueId);
          if (!cue || cue.trigger !== "journey_beat") {
            context.addIssue({
              code: "custom",
              path: [...path, "beats", beatIndex, "cueId"],
              message: `Journey beat needs a narration cue "${beat.cueId}" with trigger journey_beat`,
            });
          }
        }
        const checkpoint = chapter.checkpoint;
        if (checkpoint?.kind === "choice") {
          const optionIds = checkpoint.options.map((option) => option.id);
          if (new Set(optionIds).size !== optionIds.length) {
            context.addIssue({ code: "custom", path: [...path, "checkpoint", "options"], message: "Checkpoint option IDs must be unique" });
          }
          if (!optionIds.includes(checkpoint.correctOptionId)) {
            context.addIssue({ code: "custom", path: [...path, "checkpoint", "correctOptionId"], message: "The correct option must be one of the options" });
          }
          for (const optionId of Object.keys(checkpoint.wrongFeedback)) {
            if (!optionIds.includes(optionId) || optionId === checkpoint.correctOptionId) {
              context.addIssue({ code: "custom", path: [...path, "checkpoint", "wrongFeedback"], message: `Feedback "${optionId}" must name a wrong option` });
            }
          }
        }
        if (checkpoint?.kind === "tap") {
          for (const target of Object.keys(checkpoint.wrongFeedback)) {
            if (checkpoint.correctTargets.includes(target)) {
              context.addIssue({ code: "custom", path: [...path, "checkpoint", "wrongFeedback"], message: `Feedback "${target}" names a correct target` });
            }
          }
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

/** A guided journey: chapters of narrated beats, each ending in an optional checkpoint. */
export type JourneyDefinition = NonNullable<ModuleManifest["journey"]>;
/** One chapter of a {@link JourneyDefinition}. */
export type JourneyChapter = JourneyDefinition["chapters"][number];
/** One narrated beat of a {@link JourneyChapter}. */
export type JourneyBeat = JourneyChapter["beats"][number];
/** The question that ends a {@link JourneyChapter}. */
export type JourneyCheckpoint = NonNullable<JourneyChapter["checkpoint"]>;