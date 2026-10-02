import { EventBus, type LearningEventMap } from "@mma/engine-core";
import { describe, expect, it, vi } from "vitest";
import {
  NarrationPlayer,
  type NarrationAudioEngine,
  type NarrationCue,
  type NarrationPlayback,
  type NarrationTelemetryDraft,
  type SettingsStorage,
} from "../src/player.js";

class MemoryStorage implements SettingsStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeAudioEngine implements NarrationAudioEngine {
  readonly played: string[] = [];
  readonly stopped: string[] = [];
  readonly rates: number[] = [];
  private readonly completions = new Map<string, () => void>();
  muted = false;
  running = true;
  failPlayback = false;
  elapsedMs = 0;
  nextStarted: Promise<void> | undefined;
  rejectPendingStart: (() => void) | undefined;
  startErrors: Error[] = [];

  async resume(): Promise<boolean> { return this.running; }
  isRunning(): boolean { return this.running; }
  async decode(): Promise<unknown> { return {}; }

  play(_audio: unknown, speed: 0.75 | 1 | 1.25, onEnded: () => void): NarrationPlayback {
    if (this.failPlayback) {
      throw new Error("mock playback failure");
    }
    const id = `cue-${this.played.length + 1}`;
    this.played.push(id);
    this.rates.push(speed);
    this.completions.set(id, onEnded);
    const startError = this.startErrors.shift();
    const wasPending = this.nextStarted !== undefined;
    const started = startError
      ? Promise.reject(startError)
      : this.nextStarted ?? Promise.resolve();
    this.nextStarted = undefined;
    return {
      started,
      setSpeed: (nextSpeed) => this.rates.push(nextSpeed),
      currentTimeMs: () => this.elapsedMs,
      stop: () => {
        this.stopped.push(id);
        this.rejectPendingStart?.();
        this.rejectPendingStart = undefined;
        if (!startError && !wasPending) {
          onEnded();
        }
      },
    };
  }

  complete(id: string): void {
    this.completions.get(id)?.();
  }

  setMuted(muted: boolean): void { this.muted = muted; }
  async close(): Promise<void> {}
}

const moduleCue: NarrationCue = {
  id: "module-started",
  trigger: "module_started",
  script: "narration/en/module-started.json",
  audio: "narration/en/generated/module-started.wav.gz",
  fallbackAudio: "narration/en/generated/module-started.wav.gz",
  captionText: "Welcome to Atom Builder.",
  interruptible: true,
};
const missionCue: NarrationCue = {
  id: "sodium-start",
  trigger: "mission_started",
  missionId: "make-na-plus",
  script: "narration/en/sodium-start.json",
  audio: "narration/en/generated/sodium-start.wav.gz",
  fallbackAudio: "narration/en/generated/sodium-start.wav.gz",
  captionText: "Now make Na plus.",
  interruptible: true,
};
const invalidCue: NarrationCue = {
  id: "invalid-placement",
  trigger: "invalid_placement",
  script: "narration/en/invalid-placement.json",
  audio: "narration/en/generated/invalid-placement.wav.gz",
  fallbackAudio: "narration/en/generated/invalid-placement.wav.gz",
  captionText: "Try another position.",
  interruptible: true,
};

function createHarness(cues: readonly NarrationCue[], options: {
  readonly storage?: SettingsStorage;
  readonly audio?: FakeAudioEngine;
  readonly now?: () => number;
  readonly cooldown?: number;
  readonly idleAfterMs?: number;
  readonly document?: Document;
  readonly loadAudio?: (assetPath: string) => Promise<ArrayBuffer>;
  readonly loadCaptions?: (assetPath: string) => Promise<string>;
} = {}) {
  const events = new EventBus<LearningEventMap>();
  const audio = options.audio;
  const telemetry: NarrationTelemetryDraft[] = [];
  const captions: string[] = [];
  const player = new NarrationPlayer({
    cues,
    events,
    moduleId: "chem.atom-builder",
    loadAudio: options.loadAudio ?? (async () => new ArrayBuffer(4)),
    ...(options.loadCaptions ? { loadCaptions: options.loadCaptions } : {}),
    ...(audio ? { audioEngineFactory: () => audio } : {}),
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.cooldown === undefined ? {} : { invalidPlacementCooldownMs: options.cooldown }),
    ...(options.idleAfterMs === undefined ? {} : { idleAfterMs: options.idleAfterMs }),
    ...(options.document ? { document: options.document } : {}),
    onViewChange: (state) => {
      if (state.captionText) captions.push(state.captionText);
    },
    onTelemetry: (event) => telemetry.push(event),
  });
  return { events, player, audio, telemetry, captions };
}

function signal<Type extends "module_started" | "invalid_placement" | "idle">(
  type: Type,
  payload: LearningEventMap[Type]["payload"],
): LearningEventMap[Type] {
  return { type, payload } as LearningEventMap[Type];
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("NarrationPlayer", () => {
  it("triggers captions from the core bus without creating audio hardware", () => {
    const harness = createHarness([moduleCue]);
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));

    expect(harness.player.viewState.captionText).toBe("Welcome to Atom Builder.");
    expect(harness.player.viewState.audioEnabled).toBe(false);
    expect(harness.telemetry).toEqual([]);
    harness.player.dispose();
  });

  it("plays the module introduction before the immediately started mission", async () => {
    const audio = new FakeAudioEngine();
    const harness = createHarness([moduleCue, missionCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.events.emit("mission_started", {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      ts: "2026-10-01T00:00:00Z",
      studentRef: "opaque-test",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      moduleId: "chem.atom-builder",
      moduleVersion: "0.0.0",
      type: "mission_started",
      payload: { missionId: "make-na-plus" },
      device: { mode: "screen", tier: "mid" },
    });
    await flush();

    expect(audio.played).toHaveLength(1);
    expect(audio.stopped).toEqual([]);
    expect(harness.player.viewState.currentCueId).toBe("module-started");
    audio.complete("cue-1");
    await flush();
    expect(audio.played).toHaveLength(2);
    expect(harness.player.viewState.currentCueId).toBe("sodium-start");
    harness.player.dispose();
  });

  it("changes speed mid-cue without replacing the active media", async () => {
    const audio = new FakeAudioEngine();
    const harness = createHarness([moduleCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.player.setSpeed(0.75);
    harness.player.setSpeed(1.25);

    expect(audio.played).toEqual(["cue-1"]);
    expect(audio.rates).toEqual([1, 0.75, 1.25]);
    harness.player.dispose();
  });

  it("replays at the persisted non-default speed", async () => {
    const audio = new FakeAudioEngine();
    const harness = createHarness([moduleCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.player.setSpeed(1.25);
    harness.player.replayLastCue();
    audio.complete("cue-1");
    await flush();

    expect(audio.rates).toEqual([1, 1.25, 1.25]);
    harness.player.dispose();
  });

  it("queues the mission behind module narration without losing the 1.25x rate", async () => {
    const audio = new FakeAudioEngine();
    const harness = createHarness([moduleCue, missionCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.player.setSpeed(1.25);
    harness.events.emit("mission_started", {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      ts: "2026-10-01T00:00:00Z",
      studentRef: "opaque-test",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      moduleId: "chem.atom-builder",
      moduleVersion: "0.0.0",
      type: "mission_started",
      payload: { missionId: "make-na-plus" },
      device: { mode: "screen", tier: "mid" },
    });
    await flush();

    expect(audio.stopped).toEqual([]);
    expect(audio.rates).toEqual([1, 1.25]);
    expect(harness.player.viewState.currentCueId).toBe("module-started");
    audio.complete("cue-1");
    await flush();
    expect(audio.rates).toEqual([1, 1.25, 1.25]);
    expect(harness.player.viewState.currentCueId).toBe("sodium-start");
    harness.player.dispose();
  });

  it("queues an important cue behind a non-interruptible cue", async () => {
    const audio = new FakeAudioEngine();
    const protectedCue = { ...moduleCue, interruptible: false };
    const harness = createHarness([protectedCue, missionCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.events.emit("mission_started", {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      ts: "2026-10-01T00:00:00Z",
      studentRef: "opaque-test",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      moduleId: "chem.atom-builder",
      moduleVersion: "0.0.0",
      type: "mission_started",
      payload: { missionId: "make-na-plus" },
      device: { mode: "screen", tier: "mid" },
    });

    expect(audio.stopped).toEqual([]);
    expect(harness.player.viewState.currentCueId).toBe("module-started");
    audio.complete("cue-1");
    await flush();
    expect(audio.played).toHaveLength(2);
    expect(harness.player.viewState.currentCueId).toBe("sodium-start");
    harness.player.dispose();
  });

  it("applies cooldown to invalid-placement narration", () => {
    let now = 1_000;
    const harness = createHarness([invalidCue], { now: () => now, cooldown: 500 });
    const invalid = signal("invalid_placement", {
      missionId: "make-na-plus",
      particle: "electron",
      target: "shell:1",
    });
    harness.events.emit("invalid_placement", invalid);
    now += 100;
    harness.events.emit("invalid_placement", invalid);

    expect(harness.captions).toEqual(["Try another position."]);
    expect(harness.telemetry).toContainEqual({
      type: "narration_skipped",
      payload: { cueId: "invalid-placement", reason: "cooldown" },
    });
    harness.player.dispose();
  });

  it("persists mute, speed, captions, and sound preference locally", async () => {
    const storage = new MemoryStorage();
    const first = createHarness([], { storage, audio: new FakeAudioEngine() });
    await first.player.enableSound();
    first.player.toggleMuted();
    first.player.setSpeed(1.25);
    first.player.toggleCaptions();
    first.player.dispose();
    const second = createHarness([], { storage });

    expect(second.player.viewState.settings).toEqual({
      muted: true,
      speed: 1.25,
      captionsEnabled: false,
      soundEnabled: true,
    });
    expect(second.player.viewState.audioEnabled).toBe(false);
    second.player.dispose();

    const audioAfterReload = new FakeAudioEngine();
    const afterReload = createHarness([], { storage, audio: audioAfterReload });
    await afterReload.player.enableSound();
    expect(afterReload.player.viewState.settings.muted).toBe(true);
    expect(audioAfterReload.muted).toBe(true);
    afterReload.player.dispose();
  });

  it("migrates settings written before the versioned preference field existed", () => {
    const storage = new MemoryStorage();
    storage.setItem("mma.narration.settings.v1", JSON.stringify({
      muted: true,
      speed: 0.75,
      captionsEnabled: false,
    }));
    const harness = createHarness([], { storage });

    expect(harness.player.viewState.settings).toEqual({
      muted: true,
      speed: 0.75,
      captionsEnabled: false,
      soundEnabled: false,
    });
    harness.player.dispose();
  });

  it("reports settings storage failures instead of silently defaulting", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage: SettingsStorage = {
      getItem: () => { throw new Error("storage denied"); },
      setItem: () => { throw new Error("storage denied"); },
    };
    const harness = createHarness([], { storage });
    harness.player.setSpeed(1.25);

    expect(warning).toHaveBeenCalledTimes(2);
    expect(harness.player.viewState.settings.speed).toBe(1.25);
    warning.mockRestore();
    harness.player.dispose();
  });

  it("shows captions while muted without constructing audio", () => {
    const storage = new MemoryStorage();
    storage.setItem("mma.narration.settings.v1", JSON.stringify({ muted: true, speed: 1, captionsEnabled: true }));
    const audioFactory = vi.fn(() => new FakeAudioEngine());
    const events = new EventBus<LearningEventMap>();
    const player = new NarrationPlayer({
      cues: [moduleCue],
      events,
      moduleId: "chem.atom-builder",
      storage,
      audioEngineFactory: audioFactory,
      loadAudio: async () => new ArrayBuffer(4),
    });
    events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));

    expect(player.viewState.captionText).toBe("Welcome to Atom Builder.");
    expect(audioFactory).not.toHaveBeenCalled();
    player.dispose();
  });

  it("falls back to silent WAV when the MP3 asset is not present", async () => {
    const audio = new FakeAudioEngine();
    const cue = { ...moduleCue, audio: "narration/en/generated/module-started.mp3" };
    const requests: string[] = [];
    const harness = createHarness([cue], {
      audio,
      loadAudio: async (path) => {
        requests.push(path);
        if (path.endsWith(".mp3")) throw new Error("missing MP3");
        return new ArrayBuffer(4);
      },
    });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();

    expect(requests).toEqual([
      "narration/en/generated/module-started.mp3",
      "narration/en/generated/module-started.wav.gz",
    ]);
    expect(audio.played).toHaveLength(1);
    harness.player.dispose();
  });

  it("updates sentence captions against the timed WebVTT track", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudioEngine();
    const cue: NarrationCue = {
      ...moduleCue,
      audio: "narration/en/generated/module-started.mp3",
      captions: "narration/en/generated/module-started.vtt",
      captionText: undefined,
    };
    const harness = createHarness([cue], {
      audio,
      loadCaptions: async () => "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFirst sentence.\n\n00:00:02.000 --> 00:00:04.000\nSecond sentence.\n",
    });
    try {
      await harness.player.enableSound();
      harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
      await vi.waitFor(() => expect(harness.player.viewState.captionText).toBe("First sentence."));
      audio.elapsedMs = 2_500;
      await vi.advanceTimersByTimeAsync(50);
      expect(harness.player.viewState.captionText).toBe("Second sentence.");
    } finally {
      harness.player.dispose();
      vi.useRealTimers();
    }
  });

  it.each([0.75, 1, 1.25] as const)("syncs VTT cues in media time at %sx", async (speed) => {
    vi.useFakeTimers();
    const audio = new FakeAudioEngine();
    const cue: NarrationCue = {
      ...moduleCue,
      audio: "narration/en/generated/module-started.mp3",
      captions: "narration/en/generated/module-started.vtt",
      captionText: undefined,
    };
    const harness = createHarness([cue], {
      audio,
      loadCaptions: async () => "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFirst sentence.\n\n00:00:02.000 --> 00:00:04.000\nSecond sentence.\n",
    });
    try {
      await harness.player.enableSound();
      harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
      await vi.waitFor(() => expect(harness.player.viewState.captionText).toBe("First sentence."));
      harness.player.setSpeed(speed);
      audio.elapsedMs = 2_500;
      await vi.advanceTimersByTimeAsync(50);
      expect(harness.player.viewState.captionText).toBe("Second sentence.");
    } finally {
      harness.player.dispose();
      vi.useRealTimers();
    }
  });

  it("stops active playback when the tab becomes hidden", async () => {
    const audio = new FakeAudioEngine();
    let hidden = false;
    const fakeDocument = new EventTarget() as Document;
    Object.defineProperty(fakeDocument, "hidden", { get: () => hidden });
    const harness = createHarness([moduleCue], { audio, document: fakeDocument });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    hidden = true;
    fakeDocument.dispatchEvent(new Event("visibilitychange"));

    expect(audio.stopped).toEqual(["cue-1"]);
    expect(harness.telemetry).toContainEqual({
      type: "narration_skipped",
      payload: { cueId: "module-started", reason: "tab_hidden" },
    });
    harness.player.dispose();
  });

  it("supports an idle cue from the event bus timer", async () => {
    vi.useFakeTimers();
    const idleCue: NarrationCue = { ...moduleCue, id: "idle", trigger: "idle" };
    const harness = createHarness([idleCue], { idleAfterMs: 100 });
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(harness.player.viewState.captionText).toBe("Welcome to Atom Builder.");
    } finally {
      harness.player.dispose();
      vi.useRealTimers();
    }
  });

  it("shows a blocked state and logs when HTML audio is unavailable after a tap", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const audio = new FakeAudioEngine();
    audio.running = false;
    const harness = createHarness([], { audio });
    await harness.player.enableSound();

    expect(harness.player.viewState.soundBlocked).toBe(true);
    expect(harness.player.viewState.audioEnabled).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "Narration sound is blocked: HTML audio remained unavailable after the user gesture.",
    );
    warning.mockRestore();
    harness.player.dispose();
  });

  it("logs and emits fallback telemetry when playback fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const audio = new FakeAudioEngine();
    audio.failPlayback = true;
    const harness = createHarness([moduleCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();

    expect(warning).toHaveBeenCalledWith(
      'Narration playback failed for cue "module-started": Narration could not be played: mock playback failure',
      expect.any(Error),
    );
    expect(harness.telemetry).toContainEqual({
      type: "voice_fallback_used",
      payload: { reason: "audio_decode_failed" },
    });
    expect(harness.player.viewState.audioError).toContain("Narration playback failed");
    warning.mockRestore();
    harness.player.dispose();
  });

  it("falls back to the silent asset when HTML media play rejects", async () => {
    const audio = new FakeAudioEngine();
    audio.startErrors.push(new Error("unsupported MP3"));
    const cue: NarrationCue = {
      ...moduleCue,
      audio: "narration/en/generated/module-started.mp3",
      fallbackAudio: "narration/en/generated/module-started.wav.gz",
    };
    const loaded: string[] = [];
    const harness = createHarness([cue], {
      audio,
      loadAudio: async (path) => {
        loaded.push(path);
        return new ArrayBuffer(4);
      },
    });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await vi.waitFor(() => expect(audio.played).toHaveLength(2));

    expect(loaded).toEqual([cue.audio, cue.fallbackAudio]);
    expect(harness.player.viewState.audioError).toBeNull();
    harness.player.dispose();
  });

  it("surfaces an interrupted pending play promise", async () => {
    const audio = new FakeAudioEngine();
    let rejectStart: ((error: Error) => void) | undefined;
    audio.nextStarted = new Promise<void>((_resolve, reject) => { rejectStart = reject; });
    audio.rejectPendingStart = () => rejectStart?.(new DOMException("Playback was interrupted", "AbortError"));
    const completionCue: NarrationCue = {
      ...missionCue,
      id: "sodium-complete",
      trigger: "mission_completed",
    };
    const harness = createHarness([moduleCue, completionCue], { audio });
    await harness.player.enableSound();
    harness.events.emit("module_started", signal("module_started", { moduleId: "chem.atom-builder" }));
    await flush();
    harness.events.emit("mission_completed", {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      ts: "2026-10-01T00:00:00Z",
      studentRef: "opaque-test",
      sessionId: "550e8400-e29b-41d4-a716-446655440001",
      moduleId: "chem.atom-builder",
      moduleVersion: "0.0.0",
      type: "mission_completed",
      payload: { missionId: "make-na-plus", attempts: 1, hintsUsed: 0, assessmentIds: [] },
      device: { mode: "screen", tier: "mid" },
    });
    await flush();

    expect(harness.player.viewState.currentCueId).toBe("sodium-complete");
    expect(harness.player.viewState.audioError).toContain("playback was interrupted");
    harness.player.dispose();
  });
});