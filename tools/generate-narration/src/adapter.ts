import { gzipSync } from "node:zlib";

/** Input passed to a build-time text-to-speech adapter. */
export interface TtsInput {
  readonly text: string;
  readonly displayText?: string;
  readonly spokenText?: string;
  readonly language: string;
  readonly cueType: string;
}

/** Audio and timed captions produced by one TTS adapter. */
export interface TtsOutput {
  readonly audioBytes: Uint8Array;
  readonly captionsVtt: string;
  readonly durationMs: number;
  readonly peak?: number;
  readonly rms?: number;
}

/** Provider-neutral interface for generating one reviewed narration script. */
export interface TtsAdapter {
  readonly name: string;
  synthesize(input: TtsInput): Promise<TtsOutput>;
}

/** Mock output modes; audible tones are intended only for local development. */
export type MockTtsMode = "silent" | "audible-test";

/** Generate compressed silence and deterministic WebVTT timing for development. */
export class SilentMockTtsAdapter implements TtsAdapter {
  readonly name: string;

  constructor(private readonly mode: MockTtsMode = "silent") {
    this.name = mode === "silent" ? "silent/mock" : "audible-test/mock";
  }

  async synthesize(input: TtsInput): Promise<TtsOutput> {
    const displayText = input.displayText ?? input.text;
    const words = displayText.trim().split(/\s+/).filter(Boolean);
    const durationMs = Math.max(1_600, words.length * 300);
    const frequency = this.mode === "audible-test" ? TONE_FREQUENCIES[input.cueType] ?? 440 : undefined;
    return {
      audioBytes: gzipSync(createWav(durationMs, frequency)),
      captionsVtt: createVtt(words, durationMs),
      durationMs,
    };
  }
}

const TONE_FREQUENCIES: Readonly<Record<string, number>> = {
  module_started: 440,
  mission_started: 523,
  mission_completed: 659,
  hint_used: 392,
  invalid_placement: 330,
  idle: 294,
};

function createWav(durationMs: number, toneFrequency: number | undefined): Uint8Array {
  const sampleRate = 16_000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.ceil((sampleRate * durationMs) / 1_000);
  const dataBytes = sampleCount * channelCount * (bitsPerSample / 8);
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * (bitsPerSample / 8), true);
  view.setUint16(32, channelCount * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(wav, 36, "data");
  view.setUint32(40, dataBytes, true);
  if (toneFrequency !== undefined) {
    const fadeSamples = Math.floor(sampleRate * 0.04);
    for (let index = 0; index < sampleCount; index += 1) {
      const fadeIn = Math.min(1, index / fadeSamples);
      const fadeOut = Math.min(1, (sampleCount - index) / (fadeSamples * 2));
      const envelope = Math.min(fadeIn, fadeOut);
      const sample = Math.sin((2 * Math.PI * toneFrequency * index) / sampleRate) * 0.08 * envelope;
      view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
    }
  }
  return wav;
}

function createVtt(words: readonly string[], durationMs: number): string {
  const groups: string[][] = [];
  for (let index = 0; index < words.length; index += 7) {
    groups.push(words.slice(index, index + 7));
  }
  const segmentDuration = groups.length > 0 ? durationMs / groups.length : durationMs;
  const segments = groups.map((group, index) => {
    const start = Math.round(index * segmentDuration);
    const end = Math.round((index + 1) * segmentDuration);
    const text = group.join(" ").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `${formatVttTime(start)} --> ${formatVttTime(end)}\n${text}`;
  });
  return `WEBVTT\n\n${segments.join("\n\n")}\n`;
}

function formatVttTime(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}