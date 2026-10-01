import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

const coreEventTypeSchema = z.enum([
  "session_started",
  "session_ended",
  "mode_selected",
  "mission_started",
  "mission_completed",
  "mission_failed",
  "hint_used",
  "assessment_answered",
  "comfort_break_shown",
  "error",
  "narration_played",
  "narration_skipped",
  "voice_fallback_used",
]);

export const telemetryEventSchema = z
  .object({
    eventId: z.uuid(),
    ts: z.iso.datetime(),
    studentRef: z.string().min(1),
    sessionId: z.uuid(),
    moduleId: identifierSchema,
    moduleVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    type: coreEventTypeSchema,
    payload: z.record(z.string(), z.json()),
    device: z
      .object({
        mode: z.enum(["screen", "ar", "vr"]),
        tier: z.enum(["low", "mid", "high"]),
      })
      .strict(),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;