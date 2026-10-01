import { describe, expect, it } from "vitest";
import { telemetryEventSchema } from "./telemetry-event.js";

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
});