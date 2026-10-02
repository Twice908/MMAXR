import { createMp3Encoder } from "wasm-media-encoders";
import {
  OnnxWebRuntime,
  PhonemizeWebRuntime,
  PiperWebEngine,
  RemoteVoiceProvider,
  type PiperWebEngine as PiperEngineType,
} from "piper-tts-web";
import type {
  CachedNarrationOutput,
  DecodedPiperAudio,
  NarrationOutputCache,
  PiperAudioProcessor,
  PiperProgress,
  PiperWebRuntime,
} from "@mma/generate-narration/piper-web-adapter";

const OFFICIAL_VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/";
const MODEL_CACHE_DIRECTORY = "mma-piper-model-cache-v1";
const AUDIO_CACHE_DIRECTORY = "mma-narration-audio-cache-v2";
const DOWNLOAD_TIMEOUT_MS = 180_000;
const DEFAULT_VOICE_ID = "en_GB-jenny_dioco-medium";

export function createPiperRuntime(basePath: string): PiperWebRuntime & { destroy(): void } {
  const provider = new OpfsPiperAssetProvider(basePath || OFFICIAL_VOICE_BASE);
  const voiceProvider = new RemoteVoiceProvider({
    baseUrl: provider.baseUrl,
    provider,
  });
  const engine = new PiperWebEngine({
    voiceProvider,
    onnxRuntime: new OnnxWebRuntime({ basePath: "/onnx/", numThreads: 1 }),
    phonemizeRuntime: new PhonemizeWebRuntime({ basePath: "/piper/" }),
  }) as PiperEngineType;

  return {
    voices: () => voiceProvider.list() as Promise<Readonly<Record<string, unknown>>>,
    download: (voiceId, onProgress) => provider.downloadVoice(voiceId, onProgress),
    async synthesize(text, voiceId) {
      const output = await engine.generate(text, voiceId, 0);
      return output.file;
    },
    destroy: () => engine.destroy(),
  };
}

export function createBrowserAudioProcessor(): PiperAudioProcessor {
  return {
    async decode(wav): Promise<DecodedPiperAudio> {
      const context = new AudioContext();
      try {
        const audio = await context.decodeAudioData(await wav.arrayBuffer());
        return {
          duration: audio.duration,
          sampleRate: audio.sampleRate,
          channels: Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index)),
        };
      } finally {
        await context.close();
      }
    },
    async encodeMp3(audio, settings) {
      const encoder = await createMp3Encoder();
      encoder.configure({
        channels: settings.channels,
        sampleRate: audio.sampleRate,
        bitrate: settings.bitrateKbps,
      });
      const mono = audio.channels[0];
      if (!mono) {
        throw new Error("Piper returned audio without a channel to encode.");
      }
      const chunks: Uint8Array[] = [];
      for (let offset = 0; offset < mono.length; offset += 1_152) {
        chunks.push(Uint8Array.from(encoder.encode([mono.subarray(offset, offset + 1_152)])));
      }
      chunks.push(Uint8Array.from(encoder.finalize()));
      return concatenateBytes(chunks);
    },
  };
}

export function createOpfsNarrationOutputCache(): NarrationOutputCache {
  return {
    async get(key): Promise<CachedNarrationOutput | undefined> {
      const directory = await getDirectory(AUDIO_CACHE_DIRECTORY);
      try {
        const metadata = await readJsonFile<Pick<CachedNarrationOutput, "cacheKey" | "captionsVtt" | "durationMs" | "peak" | "rms">>(
          directory,
          `${key}.json`,
        );
        const audioBytes = await readBytesFile(directory, `${key}.mp3`);
        return { ...metadata, audioBytes };
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },
    async set(key, output): Promise<void> {
      const directory = await getDirectory(AUDIO_CACHE_DIRECTORY);
      await writeBytesFile(directory, `${key}.mp3`, output.audioBytes);
      await writeJsonFile(directory, `${key}.json`, {
        cacheKey: output.cacheKey,
        captionsVtt: output.captionsVtt,
        durationMs: output.durationMs,
        peak: output.peak,
        rms: output.rms,
      });
    },
  };
}

class OpfsPiperAssetProvider {
  readonly baseUrl: string;
  private readonly objectUrls = new Map<string, string>();

  constructor(basePath: string) {
    this.baseUrl = `${basePath.replace(/\/+$/, "")}/`;
  }

  async list(): Promise<Readonly<Record<string, unknown>>> {
    return this.fetch(`${this.baseUrl}voices.json`) as Promise<Readonly<Record<string, unknown>>>;
  }

  async fetch(url: string): Promise<unknown> {
    const cachedUrl = this.objectUrls.get(url);
    if (cachedUrl) {
      return cachedUrl;
    }
    const file = await this.readOrDownload(url);
    if (url.endsWith(".json")) {
      return JSON.parse(await file.text()) as unknown;
    }
    const objectUrl = URL.createObjectURL(file);
    this.objectUrls.set(url, objectUrl);
    return objectUrl;
  }

  async downloadVoice(voiceId: string, onProgress: (progress: PiperProgress) => void): Promise<void> {
    const voiceParts = voiceId.split("-");
    const modelPath = `${voiceParts[0]!.split("_")[0]}/${voiceParts.join("/")}/${voiceParts.join("-")}`;
    const modelUrl = `${this.baseUrl}${modelPath}.onnx`;
    const configUrl = `${modelUrl}.json`;
    await this.readOrDownload(configUrl);
    await this.readOrDownload(modelUrl, onProgress);
  }

  destroy(): void {
    for (const objectUrl of this.objectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls.clear();
  }

  private async readOrDownload(
    url: string,
    onProgress?: (progress: PiperProgress) => void,
  ): Promise<File> {
    const cacheDirectory = await getDirectory(MODEL_CACHE_DIRECTORY);
    const cacheName = `${await sha256(url)}.bin`;
    const fileHandle = await cacheDirectory.getFileHandle(cacheName, { create: true });
    try {
      const cachedFile = await fileHandle.getFile();
      if (cachedFile.size > 0) {
        return cachedFile;
      }
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    const sourceUrl = this.resolveSourceUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const writable = await fileHandle.createWritable();
    let closed = false;
    try {
      const response = await fetch(sourceUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Voice asset request failed with HTTP ${response.status}.`);
      }
      const total = Number(response.headers.get("content-length")) || undefined;
      const reader = response.body?.getReader();
      let loaded = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            await writable.write(Uint8Array.from(value).buffer as ArrayBuffer);
            loaded += value.byteLength;
            onProgress?.({ loaded, ...(total === undefined ? {} : { total }) });
          }
        }
      } else {
        const bytes = await response.arrayBuffer();
        await writable.write(bytes);
        loaded = bytes.byteLength;
        onProgress?.({ loaded, ...(total === undefined ? {} : { total }) });
      }
      await writable.close();
      closed = true;
      return fileHandle.getFile();
    } catch (error) {
      if (!closed) {
        await writable.abort();
      }
      throw new Error(
        controller.signal.aborted
          ? `Piper model download timed out after ${DOWNLOAD_TIMEOUT_MS} ms.`
          : error instanceof Error ? error.message : "Piper model download failed.",
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveSourceUrl(url: string): string {
    if (
      this.baseUrl === `${OFFICIAL_VOICE_BASE}` &&
      url.endsWith(`/${DEFAULT_VOICE_ID}.onnx`)
    ) {
      return `/piper-models/${DEFAULT_VOICE_ID}.onnx`;
    }
    return url;
  }
}

async function getDirectory(name: string): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("This browser does not support persistent OPFS storage required for Piper model caching.");
  }
  return (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
}

async function readBytesFile(directory: FileSystemDirectoryHandle, name: string): Promise<Uint8Array> {
  const file = await (await directory.getFileHandle(name)).getFile();
  return new Uint8Array(await file.arrayBuffer());
}

async function readJsonFile<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await readBytesFile(directory, name))) as T;
}

async function writeBytesFile(directory: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await writable.write(Uint8Array.from(bytes).buffer as ArrayBuffer);
  await writable.close();
}

async function writeJsonFile(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  await writeBytesFile(directory, name, new TextEncoder().encode(JSON.stringify(value)));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}