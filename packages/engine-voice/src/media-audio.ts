import type {
  NarrationAudioEngine,
  NarrationPlayback,
  NarrationSpeed,
} from "./player.js";

interface PitchPreservingAudioElement extends HTMLAudioElement {
  webkitPreservesPitch?: boolean;
  mozPreservesPitch?: boolean;
}

interface MediaAudioSource {
  readonly element: HTMLAudioElement;
  readonly objectUrl: string;
}

/** Injectable browser dependencies for testing the media-element narration engine. */
export interface BrowserNarrationAudioEngineOptions {
  readonly createAudioElement?: () => HTMLAudioElement;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}

/** Create the HTML audio implementation after the user's explicit sound gesture. */
export function createBrowserNarrationAudioEngine(
  options: BrowserNarrationAudioEngineOptions = {},
): NarrationAudioEngine {
  return new PitchPreservingMediaAudioEngine(
    options.createAudioElement ?? (() => new Audio()),
    options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob)),
    options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url)),
  );
}

/** Apply pitch preservation and one of the player-supported rates to a media element. */
export function configureNarrationAudioElement(
  element: HTMLAudioElement,
  speed: NarrationSpeed,
): void {
  const pitchElement = element as PitchPreservingAudioElement;
  pitchElement.preservesPitch = true;
  if ("webkitPreservesPitch" in pitchElement) {
    pitchElement.webkitPreservesPitch = true;
  }
  if ("mozPreservesPitch" in pitchElement) {
    pitchElement.mozPreservesPitch = true;
  }
  element.playbackRate = speed;
}

class PitchPreservingMediaAudioEngine implements NarrationAudioEngine {
  private element: HTMLAudioElement | null = null;
  private activeSource: MediaAudioSource | null = null;
  private muted = false;
  private unlocked = false;
  private closed = false;

  constructor(
    private readonly createAudioElement: () => HTMLAudioElement,
    private readonly createObjectUrl: (blob: Blob) => string,
    private readonly revokeObjectUrl: (url: string) => void,
  ) {}

  async resume(): Promise<boolean> {
    if (this.closed) {
      return false;
    }
    const element = this.getElement();
    const unlockUrl = this.createObjectUrl(createSilentWav());
    element.muted = true;
    element.preload = "auto";
    element.src = unlockUrl;
    element.load();
    let started: Promise<void>;
    try {
      started = element.play();
    } catch {
      this.revokeObjectUrl(unlockUrl);
      element.pause();
      return false;
    }
    try {
      await started;
      this.unlocked = true;
      return true;
    } catch {
      return false;
    } finally {
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.muted = this.muted;
      this.revokeObjectUrl(unlockUrl);
    }
  }

  isRunning(): boolean {
    return this.unlocked && !this.closed;
  }

  async decode(compressedAudio: ArrayBuffer): Promise<unknown> {
    const signature = new Uint8Array(compressedAudio, 0, Math.min(2, compressedAudio.byteLength));
    let audioBytes = compressedAudio;
    let mimeType = "audio/mpeg";
    if (signature[0] === 0x1f && signature[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("Compressed narration is not supported in this browser.");
      }
      const compressed = new Blob([compressedAudio]).stream();
      audioBytes = await new Response(compressed.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      mimeType = "audio/wav";
    }
    if (this.closed) {
      throw new Error("Narration audio engine is closed.");
    }

    this.releaseActiveSource();
    const element = this.getElement();
    const objectUrl = this.createObjectUrl(new Blob([audioBytes], { type: mimeType }));
    element.pause();
    element.preload = "auto";
    element.muted = this.muted;
    element.src = objectUrl;
    element.load();
    const source = { element, objectUrl };
    this.activeSource = source;
    return source;
  }

  play(
    audio: unknown,
    speed: NarrationSpeed,
    onEnded: () => void,
  ): NarrationPlayback {
    if (!this.isRunning()) {
      throw new Error("Audio is locked. Enable sound with a user gesture before playback.");
    }
    const source = audio as MediaAudioSource;
    if (source !== this.activeSource) {
      throw new Error("Narration media source is no longer active.");
    }
    const element = source.element;
    configureNarrationAudioElement(element, speed);
    element.muted = this.muted;
    element.currentTime = 0;
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      element.removeEventListener("ended", handleEnded);
      if (this.activeSource === source) {
        this.activeSource = null;
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      this.revokeObjectUrl(source.objectUrl);
    };
    const handleEnded = (): void => {
      release();
      onEnded();
    };
    element.addEventListener("ended", handleEnded, { once: true });

    let started: Promise<void>;
    try {
      started = element.play();
    } catch (error) {
      started = Promise.reject(error);
    }
    const startedWithCleanup = started.catch((error: unknown) => {
      release();
      throw error;
    });

    return {
      started: startedWithCleanup,
      setSpeed: (nextSpeed) => configureNarrationAudioElement(element, nextSpeed),
      currentTimeMs: () => element.currentTime * 1_000,
      stop: release,
    };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.element) {
      this.element.muted = muted;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.releaseActiveSource();
    this.element?.pause();
    this.element?.removeAttribute("src");
    this.element?.load();
    this.element = null;
  }

  private getElement(): HTMLAudioElement {
    this.element ??= this.createAudioElement();
    return this.element;
  }

  private releaseActiveSource(): void {
    const source = this.activeSource;
    if (!source) {
      return;
    }
    this.activeSource = null;
    source.element.pause();
    source.element.removeAttribute("src");
    source.element.load();
    this.revokeObjectUrl(source.objectUrl);
  }
}

function createSilentWav(): Blob {
  const sampleRate = 8_000;
  const sampleCount = 800;
  const dataBytes = sampleCount;
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(wav, 36, "data");
  view.setUint32(40, dataBytes, true);
  wav.fill(128, 44);
  return new Blob([wav], { type: "audio/wav" });
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}