import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SilentMockTtsAdapter } from "../src/adapter.js";
import {
  PiperWebTtsAdapter,
  createSentenceVtt,
  validatePiperAudioQuality,
  type CachedNarrationOutput,
  type DecodedPiperAudio,
} from "../src/piper-web-adapter.js";

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

describe("Piper Web TTS adapter", () => {
  const decoded: DecodedPiperAudio = {
    duration: 2,
    sampleRate: 22_050,
    channels: [new Float32Array([0, 0.5, -0.5])],
  };

  function createAdapter(overrides: {
    voices?: () => Promise<Readonly<Record<string, unknown>>>;
    download?: () => Promise<void>;
    synthesize?: (text: string) => Promise<Blob>;
    cached?: CachedNarrationOutput | undefined;
    cacheSet?: (output: CachedNarrationOutput) => Promise<void>;
    digest?: () => Promise<string>;
    onProgress?: (loaded: number, total: number) => void;
    decodedAudio?: DecodedPiperAudio;
  } = {}) {
    const calls: string[] = [];
    let cached = overrides.cached;
    const adapter = new PiperWebTtsAdapter({
      voiceId: "en_GB-jenny_dioco-medium",
      runtime: {
        voices: overrides.voices ?? (async () => ({ "en_GB-jenny_dioco-medium": {} })),
        download: async (_voiceId, onProgress) => {
          calls.push("download");
          onProgress({ loaded: 5, total: 10 });
          await overrides.download?.();
        },
        synthesize: async (text) => {
          calls.push(`synthesize:${text}`);
          return overrides.synthesize?.(text) ?? new Blob(["wav"]);
        },
      },
      audio: {
        decode: async () => overrides.decodedAudio ?? decoded,
        encodeMp3: async (_audio, settings) => {
          expect(settings).toEqual({ channels: 1, bitrateKbps: 64 });
          return new Uint8Array([1, 2, 3]);
        },
      },
      cache: {
        get: async () => cached,
        set: async (_key, output) => {
          cached = output;
          await overrides.cacheSet?.(output);
        },
      },
      digest: overrides.digest ?? (async () => "test-hash"),
      ...(overrides.onProgress ? { onProgress: ({ loaded, total }) => overrides.onProgress!(loaded, total ?? 0) } : {}),
      timeoutMs: 1_000,
    });
    return { adapter, calls };
  }

  it("satisfies the adapter contract and uses spoken text while captioning display text", async () => {
    const { adapter, calls } = createAdapter();
    const output = await adapter.synthesize({
      text: "Display Na+.",
      displayText: "Display Na+.",
      spokenText: "Display sodium plus.",
      language: "en",
      cueType: "mission_started",
    });

    expect(calls).toEqual(["download", "synthesize:Display sodium plus."]);
    expect(output.audioBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(output.durationMs).toBe(2_000);
    expect(output.captionsVtt).toContain("Display Na+.");
  });

  it("rejects an unknown configured voice before downloading", async () => {
    const { adapter, calls } = createAdapter({ voices: async () => ({}) });
    await expect(adapter.synthesize(input)).rejects.toThrow('Unknown Piper voice "en_GB-jenny_dioco-medium"');
    expect(calls).toEqual([]);
  });

  it("reports a clear download failure", async () => {
    const { adapter } = createAdapter({ download: async () => { throw new Error("network unavailable"); } });
    await expect(adapter.synthesize(input)).rejects.toThrow('Could not download Piper voice "en_GB-jenny_dioco-medium": network unavailable');
  });

  it("forwards voice model download progress", async () => {
    const progress: number[][] = [];
    const { adapter } = createAdapter({
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });
    await adapter.synthesize(input);
    expect(progress).toEqual([[5, 10]]);
  });

  it("rejects audio outside the expected seconds-per-word range before caching", async () => {
    let cacheWrites = 0;
    const { adapter } = createAdapter({
      decodedAudio: { ...decoded, duration: 0.5 },
      cacheSet: async () => { cacheWrites += 1; },
    });
    await expect(adapter.synthesize(input)).rejects.toThrow("expected 0.20 to 0.80");
    expect(cacheWrites).toBe(0);
  });

  it("rejects silent audio by peak and RMS", () => {
    const silent = {
      ...decoded,
      channels: [new Float32Array(100)],
    };
    expect(() => validatePiperAudioQuality(silent, input.text)).toThrow("audio is silent or too quiet");
  });

  it("returns cached generated output without downloading or synthesizing", async () => {
    const cached: CachedNarrationOutput = {
      cacheKey: "test-hash",
      audioBytes: new Uint8Array([9]),
      captionsVtt: "WEBVTT\n",
      durationMs: 2_000,
    };
    const { adapter, calls } = createAdapter({ cached });
    const output = await adapter.synthesize(input);
    expect(output.audioBytes).toEqual(cached.audioBytes);
    expect(output.durationMs).toBe(cached.durationMs);
    expect(output.captionsVtt).toContain(input.text);
    expect(calls).toEqual([]);
  });

  it("rebuilds cached caption text when display text changes without changing spoken audio", async () => {
    const cached: CachedNarrationOutput = {
      cacheKey: "test-hash",
      audioBytes: new Uint8Array([9]),
      captionsVtt: "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nOld caption.\n",
      durationMs: 2_000,
    };
    const { adapter, calls } = createAdapter({
      cached,
      decodedAudio: { ...decoded, duration: 1.2 },
    });
    const output = await adapter.synthesize({
      text: "Spoken phrase.",
      displayText: "Updated display phrase.",
      spokenText: "Spoken phrase.",
      language: "en",
      cueType: "module_started",
    });
    expect(output.captionsVtt).toContain("Updated display phrase.");
    expect(output.captionsVtt).not.toContain("Old caption.");
    expect(calls).toEqual([]);
  });

  it("stores generated output on a cache miss", async () => {
    const { adapter, calls } = createAdapter({
    });
    const generated = await adapter.synthesize(input);
    const cached = await adapter.synthesize(input);
    expect(generated).toHaveProperty("cacheKey", "test-hash");
    expect(cached).toEqual(generated);
    expect(calls).toEqual(["download", `synthesize:${input.text}`]);
  });

  it("splits captions by sentence using word-weighted real duration", () => {
    const vtt = createSentenceVtt("Na+ forms. Charge changes.", "Sodium. Its charge changes.", 10_000);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.500\nNa+ forms.");
    expect(vtt).toContain("00:00:02.500 --> 00:00:10.000\nCharge changes.");
  });
});