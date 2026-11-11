import { EventBus, type LearningEventMap } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import { JourneyBeatRunner, type BeatNarrator } from "../src/journey-beats.js";
import {
  NarrationPlayer,
  type NarrationAudioEngine,
  type NarrationCue,
  type NarrationCueOutcome,
  type NarrationPlayback,
  type SettingsStorage,
} from "../src/player.js";

/** Timers that only fire when the test advances them. */
function manualTimers() {
  let now = 0;
  const pending: { at: number; callback: () => void; id: number }[] = [];
  let nextId = 1;
  return {
    setTimer: (callback: () => void, delayMs: number) => {
      const id = nextId++;
      pending.push({ at: now + delayMs, callback, id });
      return id;
    },
    clearTimer: (handle: unknown) => {
      const index = pending.findIndex((item) => item.id === handle);
      if (index >= 0) pending.splice(index, 1);
    },
    advance(ms: number) {
      now += ms;
      for (const item of [...pending].sort((a, b) => a.at - b.at)) {
        if (item.at <= now && pending.includes(item)) {
          pending.splice(pending.indexOf(item), 1);
          item.callback();
        }
      }
    },
  };
}

function narrator(result: "playing" | "silent", onPlay?: (cueId: string) => void): BeatNarrator & { stops: number; played: string[] } {
  const fake = {
    stops: 0,
    played: [] as string[],
    playCue(cueId: string) {
      fake.played.push(cueId);
      onPlay?.(cueId);
      return result;
    },
    stopCurrentCue() {
      fake.stops += 1;
    },
  };
  return fake;
}

describe("JourneyBeatRunner", () => {
  it("ends a captions-only beat after its duration", () => {
    const timers = manualTimers();
    const ended: string[] = [];
    const runner = new JourneyBeatRunner({ narrator: null, onBeatEnded: (id) => ended.push(id), ...timers });
    runner.run({ id: "b1", cueId: null, durationMs: 3000 });
    timers.advance(2999);
    expect(ended).toEqual([]);
    timers.advance(1);
    expect(ended).toEqual(["b1"]);
    expect(runner.currentBeatId).toBeNull();
  });

  it("waits for spoken narration, then pauses briefly before ending", () => {
    const timers = manualTimers();
    const ended: string[] = [];
    const voice = narrator("playing");
    const runner = new JourneyBeatRunner({ narrator: voice, onBeatEnded: (id) => ended.push(id), pauseAfterSpeechMs: 500, ...timers });
    runner.run({ id: "b1", cueId: "cue-1", durationMs: 2000 });
    timers.advance(5000);
    expect(ended).toEqual([]);
    runner.cueEnded("other-cue", "ended");
    runner.cueEnded("cue-1", "ended");
    timers.advance(499);
    expect(ended).toEqual([]);
    timers.advance(1);
    expect(ended).toEqual(["b1"]);
    expect(voice.played).toEqual(["cue-1"]);
  });

  it("falls back to the beat's duration when the cue is silent, fails, or never reports", () => {
    const timers = manualTimers();
    const ended: string[] = [];
    const silent = new JourneyBeatRunner({ narrator: narrator("silent"), onBeatEnded: (id) => ended.push(id), ...timers });
    silent.run({ id: "quiet", cueId: "cue-1", durationMs: 1000 });
    timers.advance(1000);
    expect(ended).toEqual(["quiet"]);

    const failing = new JourneyBeatRunner({ narrator: narrator("playing"), onBeatEnded: (id) => ended.push(id), ...timers });
    failing.run({ id: "broken", cueId: "cue-2", durationMs: 1000 });
    failing.cueEnded("cue-2", "failed");
    timers.advance(1000);
    expect(ended).toEqual(["quiet", "broken"]);

    const lost = new JourneyBeatRunner({ narrator: narrator("playing"), onBeatEnded: (id) => ended.push(id), ...timers });
    lost.run({ id: "lost", cueId: "cue-3", durationMs: 1000 });
    timers.advance(10_000);
    expect(ended).toEqual(["quiet", "broken", "lost"]);
  });

  it("handles a missing audio file reported while starting the cue", () => {
    const timers = manualTimers();
    const ended: string[] = [];
    let runner: JourneyBeatRunner | null = null;
    const voice = narrator("playing", (cueId) => runner?.cueEnded(cueId, "unavailable"));
    runner = new JourneyBeatRunner({ narrator: voice, onBeatEnded: (id) => ended.push(id), ...timers });
    runner.run({ id: "b1", cueId: "cue-1", durationMs: 1500 });
    timers.advance(1500);
    expect(ended).toEqual(["b1"]);
  });

  it("stops speaking and never ends a stopped or replaced beat", () => {
    const timers = manualTimers();
    const ended: string[] = [];
    const voice = narrator("playing");
    const runner = new JourneyBeatRunner({ narrator: voice, onBeatEnded: (id) => ended.push(id), ...timers });
    runner.run({ id: "b1", cueId: "cue-1", durationMs: 1000 });
    runner.stop();
    expect(voice.stops).toBe(1);
    runner.cueEnded("cue-1", "ended");
    timers.advance(20_000);
    expect(ended).toEqual([]);
    runner.run({ id: "b2", cueId: null, durationMs: 1000 });
    runner.run({ id: "b3", cueId: null, durationMs: 2000 });
    timers.advance(2000);
    expect(ended).toEqual(["b3"]);
  });
});

class QuietStorage implements SettingsStorage {
  getItem(): string | null {
    return null;
  }
  setItem(): void {}
}

class EndableAudio implements NarrationAudioEngine {
  private onEnded: (() => void) | null = null;
  async resume(): Promise<boolean> { return true; }
  isRunning(): boolean { return true; }
  async decode(): Promise<unknown> { return {}; }
  play(_audio: unknown, _speed: 0.75 | 1 | 1.25, onEnded: () => void): NarrationPlayback {
    this.onEnded = onEnded;
    return { started: Promise.resolve(), setSpeed: () => undefined, stop: () => onEnded() };
  }
  finish(): void {
    this.onEnded?.();
  }
  setMuted(): void {}
  async close(): Promise<void> {}
}

const beatCue: NarrationCue = {
  id: "beat-cue",
  trigger: "journey_beat",
  script: "narration/en/beat.json",
  audio: "narration/en/generated/beat.mp3",
  captionText: "Two cells float in front of you.",
};
const noAudioCue: NarrationCue = { id: "no-audio", trigger: "journey_beat", script: "x.json", captionText: "Look closer." };

function player(audio: NarrationAudioEngine, ended: [string, NarrationCueOutcome][]) {
  return new NarrationPlayer({
    cues: [beatCue, noAudioCue],
    events: new EventBus<LearningEventMap>(),
    moduleId: "bio.cell-explorer",
    loadAudio: async () => new ArrayBuffer(4),
    audioEngineFactory: () => audio,
    storage: new QuietStorage(),
    onCueEnded: (cueId, outcome) => ended.push([cueId, outcome]),
  });
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("NarrationPlayer.playCue", () => {
  it("shows the caption silently until sound is enabled", () => {
    const ended: [string, NarrationCueOutcome][] = [];
    const narration = player(new EndableAudio(), ended);
    expect(narration.playCue("beat-cue")).toBe("silent");
    expect(narration.viewState.captionText).toBe("Two cells float in front of you.");
    expect(narration.playCue("unknown")).toBe("silent");
    narration.dispose();
  });

  it("plays a beat cue and reports when it ends; stopping reports nothing", async () => {
    const ended: [string, NarrationCueOutcome][] = [];
    const audio = new EndableAudio();
    const narration = player(audio, ended);
    await narration.enableSound();
    expect(narration.playCue("beat-cue")).toBe("playing");
    await flush();
    expect(narration.viewState.currentCueId).toBe("beat-cue");
    audio.finish();
    expect(ended).toEqual([["beat-cue", "ended"]]);

    narration.playCue("beat-cue");
    await flush();
    narration.stopCurrentCue();
    expect(ended).toEqual([["beat-cue", "ended"]]);
    expect(narration.viewState.currentCueId).toBeNull();

    narration.playCue("no-audio");
    expect(ended).toEqual([["beat-cue", "ended"], ["no-audio", "unavailable"]]);
    narration.dispose();
  });
});
