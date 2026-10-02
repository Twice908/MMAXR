import type { TtsAdapter, TtsInput, TtsOutput } from "./adapter.js";

export interface PiperProgress {
  readonly loaded: number;
  readonly total?: number;
}

export interface PiperWebRuntime {
  voices(): Promise<Readonly<Record<string, unknown>>>;
  download(voiceId: string, onProgress: (progress: PiperProgress) => void): Promise<void>;
  synthesize(text: string, voiceId: string): Promise<Blob>;
}

export interface DecodedPiperAudio {
  readonly duration: number;
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

export interface PiperAudioQuality {
  readonly durationMs: number;
  readonly wordCount: number;
  readonly secondsPerWord: number;
  readonly peak: number;
  readonly rms: number;
}

export interface PiperAudioProcessor {
  decode(wav: Blob): Promise<DecodedPiperAudio>;
  encodeMp3(
    audio: DecodedPiperAudio,
    settings: PiperEncodingSettings,
  ): Promise<Uint8Array>;
}

export interface PiperEncodingSettings {
  readonly channels: 1;
  readonly bitrateKbps: 64;
}

export interface CachedNarrationOutput extends TtsOutput {
  readonly cacheKey: string;
}

export interface NarrationOutputCache {
  get(key: string): Promise<CachedNarrationOutput | undefined>;
  set(key: string, output: CachedNarrationOutput): Promise<void>;
}

export interface PiperWebTtsAdapterOptions {
  readonly voiceId: string;
  readonly runtime: PiperWebRuntime;
  readonly audio: PiperAudioProcessor;
  readonly cache: NarrationOutputCache;
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: PiperProgress) => void;
  readonly digest?: (value: string) => Promise<string>;
}

const ENCODING_SETTINGS: PiperEncodingSettings = {
  channels: 1,
  bitrateKbps: 64,
};

/** Generate browser-only Piper audio, estimated sentence captions, and cached MP3 output. */
export class PiperWebTtsAdapter implements TtsAdapter {
  readonly name = "piper-web";
  private readonly timeoutMs: number;

  constructor(private readonly options: PiperWebTtsAdapterOptions) {
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async synthesize(input: TtsInput): Promise<TtsOutput> {
    const spokenText = input.spokenText?.trim() || input.text;
    const displayText = input.displayText ?? input.text;
    const cacheKey = await (this.options.digest ?? sha256)(JSON.stringify({
      spokenText,
      voiceId: this.options.voiceId,
      settings: ENCODING_SETTINGS,
    }));
    const cached = await this.options.cache.get(cacheKey);
    if (cached) {
      const cachedAudio = await this.options.audio.decode(createMp3Blob(cached.audioBytes));
      const quality = validatePiperAudioQuality(cachedAudio, spokenText);
      return {
        ...cached,
        captionsVtt: createSentenceVtt(displayText, spokenText, quality.durationMs),
        durationMs: quality.durationMs,
        peak: quality.peak,
        rms: quality.rms,
      };
    }

    const voices = await withTimeout(this.options.runtime.voices(), this.timeoutMs, "voice list");
    if (!Object.hasOwn(voices, this.options.voiceId)) {
      throw new Error(`Unknown Piper voice "${this.options.voiceId}". Check PIPER_VOICE_ID and the configured voice catalog.`);
    }

    await withTimeout(
      this.options.runtime.download(this.options.voiceId, (progress) => this.options.onProgress?.(progress)),
      this.timeoutMs,
      `voice download for "${this.options.voiceId}"`,
    ).catch((error: unknown) => {
      throw new Error(`Could not download Piper voice "${this.options.voiceId}": ${errorMessage(error)}`);
    });

    const wav = await withTimeout(
      this.options.runtime.synthesize(spokenText, this.options.voiceId),
      this.timeoutMs,
      "speech generation",
    );
    const decoded = await this.options.audio.decode(wav);
    validatePiperAudioQuality(decoded, spokenText);
    const audioBytes = await this.options.audio.encodeMp3(decoded, ENCODING_SETTINGS);
    const decodedMp3 = await this.options.audio.decode(createMp3Blob(audioBytes));
    const quality = validatePiperAudioQuality(decodedMp3, spokenText);
    const output: CachedNarrationOutput = {
      audioBytes,
      captionsVtt: createSentenceVtt(displayText, spokenText, quality.durationMs),
      durationMs: quality.durationMs,
      peak: quality.peak,
      rms: quality.rms,
      cacheKey,
    };
    await this.options.cache.set(cacheKey, output);
    return output;
  }
}

/** Reject decoded narration that is silent or implausibly short or long for its spoken text. */
export function validatePiperAudioQuality(audio: DecodedPiperAudio, spokenText: string): PiperAudioQuality {
  const samples = audio.channels[0];
  const wordCount = spokenText.trim().split(/\s+/).filter(Boolean).length;
  if (!samples || samples.length === 0 || wordCount === 0 || !Number.isFinite(audio.duration) || audio.duration <= 0) {
    throw new Error("Piper audio quality check failed: decoded audio or spoken text is empty.");
  }

  let peak = 0;
  let squaredSamples = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) {
      peak = magnitude;
    }
    squaredSamples += sample * sample;
  }
  const rms = Math.sqrt(squaredSamples / samples.length);
  const durationMs = Math.round(audio.duration * 1_000);
  const secondsPerWord = audio.duration / wordCount;
  if (secondsPerWord < 0.2 || secondsPerWord > 0.8) {
    throw new Error(
      `Piper audio quality check failed: ${audio.duration.toFixed(2)} seconds for ${wordCount} words ` +
      `(${secondsPerWord.toFixed(2)} seconds per word; expected 0.20 to 0.80).`,
    );
  }
  if (peak < 0.02 || rms < 0.005) {
    throw new Error(
      `Piper audio quality check failed: audio is silent or too quiet (peak ${peak.toFixed(4)}, RMS ${rms.toFixed(4)}).`,
    );
  }
  return { durationMs, wordCount, secondsPerWord, peak, rms };
}

/** Split display captions by sentence and allocate real audio duration by spoken word count. */
export function createSentenceVtt(displayText: string, spokenText: string, durationMs: number): string {
  const displaySentences = splitSentences(displayText);
  const spokenSentences = splitSentences(spokenText);
  const timingSentences = spokenSentences.length === displaySentences.length
    ? spokenSentences
    : displaySentences;
  const weights = timingSentences.map((sentence) => Math.max(1, countWords(sentence)));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let elapsedWeight = 0;
  const segments = displaySentences.map((sentence, index) => {
    const start = Math.round((elapsedWeight / totalWeight) * durationMs);
    elapsedWeight += weights[index]!;
    const end = index === displaySentences.length - 1
      ? durationMs
      : Math.round((elapsedWeight / totalWeight) * durationMs);
    return `${formatVttTime(start)} --> ${formatVttTime(end)}\n${escapeVtt(sentence)}`;
  });
  return `WEBVTT\n\n${segments.join("\n\n")}\n`;
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeVtt(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatVttTime(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out during ${operation} after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function createMp3Blob(audioBytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(audioBytes).buffer as ArrayBuffer], { type: "audio/mpeg" });
}