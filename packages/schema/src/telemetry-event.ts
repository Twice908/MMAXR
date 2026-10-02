import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export const arErrorReasonCodeSchema = z.enum([
  "permission_denied",
  "tracking_lost",
  "unsupported",
  "dom_overlay_unavailable",
  "unknown",
]);

const arFeatureSchema = z.enum(["hit-test", "dom-overlay"]);

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
  "ar_session_started",
  "ar_session_ended",
  "ar_placement",
  "ar_error",
]);

const telemetryEnvelopeSchema = z
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

export const telemetryEventSchema = telemetryEnvelopeSchema.extend({
  type: coreEventTypeSchema,
  payload: z.record(z.string(), z.json()),
}).strict();

export const arTelemetryEventSchema = z.discriminatedUnion("type", [
  telemetryEnvelopeSchema.extend({
    type: z.literal("ar_session_started"),
    payload: z.object({ grantedFeatures: z.array(arFeatureSchema) }).strict(),
  }).strict(),
  telemetryEnvelopeSchema.extend({
    type: z.literal("ar_session_ended"),
    payload: z.object({ durationSec: z.number().nonnegative() }).strict(),
  }).strict(),
  telemetryEnvelopeSchema.extend({
    type: z.literal("ar_placement"),
    payload: z.object({}).strict(),
  }).strict(),
  telemetryEnvelopeSchema.extend({
    type: z.literal("ar_error"),
    payload: z.object({ reasonCode: arErrorReasonCodeSchema }).strict(),
  }).strict(),
]);

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type ArTelemetryEvent = z.infer<typeof arTelemetryEventSchema>;
export type ArErrorReasonCode = z.infer<typeof arErrorReasonCodeSchema>;
export type ArFeature = z.infer<typeof arFeatureSchema>;