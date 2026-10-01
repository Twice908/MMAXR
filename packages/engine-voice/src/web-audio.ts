import type {
  NarrationAudioEngine,
  NarrationPlayback,
  NarrationSpeed,
} from "./player.js";

/** Create the browser Web Audio implementation, called only after user input. */
export function createBrowserNarrationAudioEngine(): NarrationAudioEngine {
  if (typeof AudioContext === "undefined") {
    throw new Error("Web Audio is not available in this browser.");
  }
  return new WebAudioNarrationEngine(new AudioContext());
}

class WebAudioNarrationEngine implements NarrationAudioEngine {
  private readonly gain: GainNode;

  constructor(private readonly context: AudioContext) {
    this.gain = context.createGain();
    this.gain.connect(context.destination);
  }

  async resume(): Promise<boolean> {
    if (this.context.state !== "running") {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    return this.isRunning();
  }

  isRunning(): boolean {
    return this.context.state === "running";
  }

  async decode(compressedAudio: ArrayBuffer): Promise<AudioBuffer> {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Compressed narration is not supported in this browser.");
    }
    const compressed = new Blob([compressedAudio]).stream();
    const wav = await new Response(compressed.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return this.context.decodeAudioData(wav);
  }

  play(audio: unknown, speed: NarrationSpeed, onEnded: () => void): NarrationPlayback {
    if (!this.isRunning()) {
      throw new Error("AudioContext is suspended; playback was not started.");
    }
    const source = this.context.createBufferSource();
    source.buffer = audio as AudioBuffer;
    source.playbackRate.value = speed;
    source.connect(this.gain);
    source.onended = onEnded;
    source.start();
    return {
      setSpeed: (nextSpeed) => {
        source.playbackRate.setValueAtTime(nextSpeed, this.context.currentTime);
      },
      stop: () => {
        try {
          source.stop();
        } catch {
          source.disconnect();
        }
      },
    };
  }

  setMuted(muted: boolean): void {
    this.gain.gain.setValueAtTime(muted ? 0 : 1, this.context.currentTime);
  }

  async close(): Promise<void> {
    if (this.context.state !== "closed") {
      await this.context.close();
    }
  }
}