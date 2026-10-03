import { describe, expect, it } from "vitest";
import { arTelemetryEventSchema, telemetryEventSchema } from "./telemetry-event.js";

const validEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  ts: "2026-10-01T10:15:30Z",
  studentRef: "opaque-id",
  sessionId: "550e8400-e29b-41d4-a716-446655440001",
  moduleId: "chem.atom-builder",
  moduleVersion: "1.0.3",
  type: "mission_completed",
  payload: {
    missionId: "make-na-ion",
    attempts: 3,
    hintsUsed: 1,
    durationSec: 142,
  },
  device: { mode: "ar", tier: "mid" },
};

describe("telemetryEventSchema", () => {
  it("validates the shared telemetry envelope", () => {
    expect(telemetryEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("rejects invalid UUIDs, event types, and device values", () => {
    const result = telemetryEventSchema.safeParse({
      ...validEvent,
      eventId: "not-a-uuid",
      type: "narration_played",
      device: { mode: "screen", tier: "ultra" },
    });

    expect(result.success).toBe(false);
  });

  it("requires a UTC ISO timestamp and a semantic module version", () => {
    const result = telemetryEventSchema.safeParse({
      ...validEvent,
      ts: "yesterday",
      moduleVersion: "latest",
    });

    expect(result.success).toBe(false);
  });

  it.each(["narration_played", "narration_skipped", "voice_fallback_used"])(
    "accepts local narration telemetry type %s",
    (type) => {
      expect(telemetryEventSchema.safeParse({ ...validEvent, type, payload: { cueId: "intro" } }).success)
        .toBe(true);
    },
  );

  it("accepts the local comfort break event", () => {
    expect(telemetryEventSchema.safeParse({
      ...validEvent,
      type: "comfort_break_shown",
      payload: { missionId: "build-carbon-12" },
    }).success).toBe(true);
  });

  it.each([
    { type: "ar_session_started", payload: { grantedFeatures: ["hit-test"] } },
    { type: "ar_session_ended", payload: { durationSec: 125 } },
    { type: "ar_placement", payload: {} },
    { type: "ar_error", payload: { reasonCode: "tracking_lost" } },
  ])("validates AR telemetry type $type", (event) => {
    expect(telemetryEventSchema.safeParse({ ...validEvent, ...event }).success).toBe(true);
    expect(arTelemetryEventSchema.safeParse({ ...validEvent, ...event }).success).toBe(true);
  });

  it("requires a nonnegative duration and a known AR error reason", () => {
    expect(arTelemetryEventSchema.safeParse({
      ...validEvent,
      type: "ar_session_ended",
      payload: { durationSec: -1 },
    }).success).toBe(false);
    expect(arTelemetryEventSchema.safeParse({
      ...validEvent,
      type: "ar_error",
      payload: { reasonCode: "camera_upload_failed" },
    }).success).toBe(false);
  });
});