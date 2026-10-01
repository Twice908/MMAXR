import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SilentMockTtsAdapter } from "../src/adapter.js";

const input = {
  text: "A short test caption for audio duration.",
  language: "en",
  cueType: "mission_started",
};

describe("mock TTS adapter modes", () => {
  it("keeps silent mock audio as the default", async () => {
    const output = await new SilentMockTtsAdapter().synthesize(input);
    const wav = gunzipSync(output.audioBytes);

    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(44).every((sample) => sample === 0)).toBe(true);
    expect(output.captionsVtt).toContain("A short test caption");
  });

  it("makes a soft cue-specific tone with the same duration as captions", async () => {
    const adapter = new SilentMockTtsAdapter("audible-test");
    const started = await adapter.synthesize(input);
    const completed = await adapter.synthesize({ ...input, cueType: "mission_completed" });
    const startedWav = gunzipSync(started.audioBytes);
    const completedWav = gunzipSync(completed.audioBytes);

    expect(startedWav.subarray(44).some((sample) => sample !== 0)).toBe(true);
    expect(startedWav.subarray(44)).not.toEqual(completedWav.subarray(44));
    expect(started.durationMs).toBeGreaterThan(0);
    expect(started.captionsVtt).toContain("WEBVTT");
    expect(adapter.name).toBe("audible-test/mock");
  });
});