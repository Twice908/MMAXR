import {
  EventBus,
  type LearningEventDraft,
  type LearningEventMap,
} from "@mma/engine-core";
import type { ModuleManifest } from "@mma/schema";
import { createBrowserNarrationAudioEngine } from "./web-audio.js";

/** A narration cue after manifest validation. */
export type NarrationCue = NonNullable<ModuleManifest["narration"]>["cues"][number];

/** Supported playback rates for scripted narration. */
export type NarrationSpeed = 0.75 | 1 | 1.25;

/** Locally persisted narration preferences. */
export interface NarrationSettings {
  readonly muted: boolean;
  readonly speed: NarrationSpeed;
  readonly captionsEnabled: boolean;
  readonly soundEnabled: boolean;
}

/** Storage methods needed for local-only preference persistence. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Handle for one active Web Audio source. */
export interface NarrationPlayback {
  setSpeed(speed: NarrationSpeed): void;
  stop(): void;
}

/** Audio operations required by the player, injectable for tests. */
export interface NarrationAudioEngine {
  resume(): Promise<boolean>;
  isRunning(): boolean;
  decode(compressedAudio: ArrayBuffer): Promise<unknown>;
  play(
    audio: unknown,
    speed: NarrationSpeed,
    onEnded: () => void,
  ): NarrationPlayback;
  setMuted(muted: boolean): void;
  close(): Promise<void>;
}

/** Telemetry drafts emitted by the local narration player. */
export type NarrationTelemetryDraft = Extract<
  LearningEventDraft,
  { type: "narration_played" | "narration_skipped" | "voice_fallback_used" }
>;

/** State rendered by the HUD from the narration player. */
export interface NarrationViewState {
  readonly captionText: string;
  readonly settings: NarrationSettings;
  readonly audioEnabled: boolean;
  readonly audioUnavailable: boolean;
  readonly soundBlocked: boolean;
  readonly currentCueId: string | null;
}

/** Dependencies and integration points for a screen-mode narration player. */
export interface NarrationPlayerOptions {
  readonly cues: readonly NarrationCue[];
  readonly events: EventBus<LearningEventMap>;
  readonly moduleId: string;
  readonly loadAudio: (assetPath: string) => Promise<ArrayBuffer>;
  readonly loadCaptions?: (assetPath: string) => Promise<string>;
  readonly audioEngineFactory?: () => NarrationAudioEngine;
  readonly storage?: SettingsStorage;
  readonly activityTarget?: HTMLElement;
  readonly document?: Document;
  readonly now?: () => number;
  readonly invalidPlacementCooldownMs?: number;
  readonly idleAfterMs?: number;
  readonly onViewChange?: (state: NarrationViewState) => void;
  readonly onTelemetry?: (event: NarrationTelemetryDraft) => void;
}

interface QueuedCue {
  readonly cue: NarrationCue;
  readonly priority: number;
}

interface ActiveCue extends QueuedCue {
  readonly token: number;
  playback?: NarrationPlayback;
}

const SETTINGS_KEY = "mma.narration.settings.v1";
const PRIORITY: Record<NarrationCue["trigger"], number> = {
  mission_completed: 5,
  mission_started: 4,
  module_started: 3,
  hint_used: 2,
  invalid_placement: 1,
  idle: 0,
};
const DEFAULT_SETTINGS: NarrationSettings = {
  muted: false,
  speed: 1,
  captionsEnabled: true,
  soundEnabled: false,
};

/** Subscribe to learning events and play one scripted narration cue at a time. */
export class NarrationPlayer {
  private readonly options: NarrationPlayerOptions;
  private readonly settingsStorage: SettingsStorage | undefined;
  private readonly documentRef: Document | undefined;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly activityTarget: HTMLElement | undefined;
  private settingsValue: NarrationSettings;
  private audioEngine: NarrationAudioEngine | null = null;
  private audioEnabled = false;
  private audioUnavailable = false;
  private soundBlocked = false;
  private captionText = "";
  private captionCueId: string | null = null;
  private lastCue: NarrationCue | null = null;
  private current: ActiveCue | null = null;
  private readonly queue: QueuedCue[] = [];
  private playToken = 0;
  private lastInvalidPlacementAt = Number.NEGATIVE_INFINITY;
  private lastActivityAt: number;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  /** Create a player and subscribe it to the engine-core event bus. */
  constructor(options: NarrationPlayerOptions) {
    this.options = options;
    this.settingsStorage = options.storage ?? getBrowserStorage();
    this.documentRef = options.document ?? getBrowserDocument();
    this.activityTarget = options.activityTarget;
    this.settingsValue = loadSettings(this.settingsStorage, (error) => {
      console.warn("Narration settings could not be read from local storage; using defaults.", error);
      this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "settings_storage_unavailable" } });
    });
    this.lastActivityAt = this.now();
    const triggers = new Set(options.cues.map((cue) => cue.trigger));
    for (const trigger of triggers) {
      this.unsubscribers.push(options.events.subscribe(trigger, (event) => {
        this.onTrigger(trigger, event as LearningEventMap[typeof trigger]);
      }));
    }
    this.activityTarget?.addEventListener("pointerdown", this.onActivity);
    this.activityTarget?.addEventListener("keydown", this.onActivity);
    this.documentRef?.addEventListener("visibilitychange", this.onVisibilityChange);
    this.armIdleTimer();
    this.publishView();
  }

  /** Return a detached view of current settings and player status. */
  get viewState(): NarrationViewState {
    return {
      captionText: this.captionText,
      settings: { ...this.settingsValue },
      audioEnabled: this.audioEnabled,
      audioUnavailable: this.audioUnavailable,
      soundBlocked: this.soundBlocked,
      currentCueId: this.current?.cue.id ?? null,
    };
  }

  /** Enable audio after an explicit user gesture and drain queued cues. */
  async enableSound(): Promise<void> {
    if (this.disposed || this.audioUnavailable) {
      return;
    }
    try {
      if (!this.audioEngine) {
        const factory = this.options.audioEngineFactory ?? createBrowserNarrationAudioEngine;
        this.audioEngine = factory();
        this.audioEngine.setMuted(this.settingsValue.muted);
      }
      const running = await this.audioEngine.resume();
      if (!running || !this.audioEngine.isRunning()) {
        this.audioEnabled = false;
        this.soundBlocked = true;
        console.warn("Narration sound is blocked: AudioContext remains suspended after the user gesture.");
        this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "audio_context_suspended" } });
        this.publishView();
        return;
      }
      this.updateSettings({ soundEnabled: true });
      this.audioEnabled = true;
      this.audioUnavailable = false;
      this.soundBlocked = false;
      this.publishView();
      this.playNextQueued();
    } catch (error) {
      this.audioUnavailable = true;
      this.audioEnabled = false;
      console.warn("Narration audio could not be enabled after the user gesture.", error);
      this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "audio_unavailable" } });
      this.publishView();
    }
  }

  /** Toggle mute and persist the preference locally. */
  toggleMuted(): void {
    this.updateSettings({ muted: !this.settingsValue.muted });
    this.audioEngine?.setMuted(this.settingsValue.muted);
    if (!this.settingsValue.muted && !this.audioEnabled) {
      void this.enableSound();
    } else if (!this.settingsValue.muted) {
      this.playNextQueued();
    }
  }

  /** Set and persist a supported narration playback rate. */
  setSpeed(speed: NarrationSpeed): void {
    if (speed !== 0.75 && speed !== 1 && speed !== 1.25) {
      return;
    }
    this.updateSettings({ speed });
    this.current?.playback?.setSpeed(speed);
  }

  /** Toggle caption visibility without changing audio playback. */
  toggleCaptions(): void {
    this.updateSettings({ captionsEnabled: !this.settingsValue.captionsEnabled });
  }

  /** Replay the most recently triggered cue when the user requests it. */
  replayLastCue(): void {
    if (!this.lastCue || this.disposed) {
      return;
    }
    this.showCaption(this.lastCue);
    if (this.settingsValue.muted) {
      this.publishSkipped(this.lastCue, "muted");
      return;
    }
    if (!this.audioEnabled) {
      this.queueCue(this.lastCue);
      void this.enableSound();
      return;
    }
    this.scheduleCue(this.lastCue);
  }

  /** Stop playback, detach event listeners, and release audio resources. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.activityTarget?.removeEventListener("pointerdown", this.onActivity);
    this.activityTarget?.removeEventListener("keydown", this.onActivity);
    this.documentRef?.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
    }
    this.stopCurrent("disposed");
    this.queue.length = 0;
    void this.audioEngine?.close();
  }

  private readonly onActivity = (): void => {
    this.lastActivityAt = this.now();
    this.armIdleTimer();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.documentRef?.hidden) {
      this.stopCurrent("tab_hidden");
      for (const queued of this.queue.splice(0)) {
        this.publishSkipped(queued.cue, "tab_hidden");
      }
    }
  };

  private onTrigger(
    trigger: NarrationCue["trigger"],
    event: LearningEventMap[NarrationCue["trigger"]],
  ): void {
    if (this.disposed) {
      return;
    }
    this.onActivity();
    const payload = event.payload as { readonly missionId?: string };
    const cue = this.options.cues.find((candidate) =>
      candidate.trigger === trigger &&
      (!candidate.missionId || candidate.missionId === payload.missionId),
    );
    if (!cue) {
      return;
    }
    const timestamp = this.now();
    if (
      trigger === "invalid_placement" &&
      timestamp - this.lastInvalidPlacementAt < (this.options.invalidPlacementCooldownMs ?? 4_000)
    ) {
      this.publishSkipped(cue, "cooldown");
      return;
    }
    if (trigger === "invalid_placement") {
      this.lastInvalidPlacementAt = timestamp;
    }
    this.lastCue = cue;
    this.showCaption(cue);
    if (this.settingsValue.muted) {
      this.publishSkipped(cue, "muted");
      return;
    }
    if (this.documentRef?.hidden) {
      this.publishSkipped(cue, "tab_hidden");
      return;
    }
    if (!this.audioEnabled) {
      this.queueCue(cue);
      return;
    }
    this.scheduleCue(cue);
  }

  private showCaption(cue: NarrationCue): void {
    this.captionCueId = cue.id;
    if (cue.captionText) {
      this.captionText = cue.captionText;
      this.publishView();
      return;
    }
    if (!cue.captions || !this.options.loadCaptions) {
      this.captionText = "";
      this.publishView();
      return;
    }
    void this.options.loadCaptions(cue.captions).then((captions) => {
      if (this.captionCueId === cue.id && !this.disposed) {
        this.captionText = textFromVtt(captions);
        this.publishView();
      }
    }).catch(() => {
      if (this.captionCueId === cue.id && !this.disposed) {
        this.captionText = "";
        this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "captions_unavailable" } });
        this.publishView();
      }
    });
  }

  private scheduleCue(cue: NarrationCue): void {
    const incoming = { cue, priority: PRIORITY[cue.trigger] };
    if (this.current) {
      if (incoming.priority <= this.current.priority || this.current.cue.interruptible === false) {
        this.queueCue(cue);
        return;
      }
      this.stopCurrent("interrupted");
    }
    this.startCue(incoming);
  }

  private queueCue(cue: NarrationCue): void {
    const queued = { cue, priority: PRIORITY[cue.trigger] };
    const insertAt = this.queue.findIndex((item) => item.priority < queued.priority);
    if (insertAt < 0) {
      this.queue.push(queued);
    } else {
      this.queue.splice(insertAt, 0, queued);
    }
  }

  private playNextQueued(): void {
    if (
      this.current || !this.audioEnabled || this.settingsValue.muted ||
      this.documentRef?.hidden || this.queue.length === 0
    ) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      this.startCue(next);
    }
  }

  private startCue(queued: QueuedCue): void {
    if (!queued.cue.audio || !this.audioEngine) {
      this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "audio_asset_missing" } });
      this.publishSkipped(queued.cue, "audio_unavailable");
      this.playNextQueued();
      return;
    }
    const active: ActiveCue = { ...queued, token: ++this.playToken };
    this.current = active;
    this.showCaption(queued.cue);
    void this.loadAndPlay(active);
  }

  private async loadAndPlay(active: ActiveCue): Promise<void> {
    try {
      const compressedAudio = await this.options.loadAudio(active.cue.audio!);
      const decoded = await this.audioEngine!.decode(compressedAudio);
      if (this.current?.token !== active.token || this.disposed || this.documentRef?.hidden) {
        return;
      }
      active.playback = this.audioEngine!.play(decoded, this.settingsValue.speed, () => {
        if (this.current?.token === active.token) {
          this.current = null;
          this.publishView();
          this.playNextQueued();
        }
      });
      this.publishTelemetry({
        type: "narration_played",
        payload: { cueId: active.cue.id, trigger: active.cue.trigger },
      });
      this.publishView();
    } catch (error) {
      if (this.current?.token === active.token) {
        this.current = null;
        this.soundBlocked = this.audioEngine?.isRunning() !== true;
        if (this.soundBlocked) {
          this.audioEnabled = false;
        }
        console.warn(`Narration playback failed for cue "${active.cue.id}".`, error);
        this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "audio_decode_failed" } });
        this.publishSkipped(active.cue, "audio_unavailable");
        this.publishView();
        this.playNextQueued();
      }
    }
  }

  private stopCurrent(reason: string): void {
    const active = this.current;
    if (!active) {
      return;
    }
    this.current = null;
    this.playToken += 1;
    active.playback?.stop();
    this.publishSkipped(active.cue, reason);
    this.publishView();
  }

  private updateSettings(patch: Partial<NarrationSettings>): void {
    this.settingsValue = { ...this.settingsValue, ...patch };
    try {
      this.settingsStorage?.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, ...this.settingsValue }));
    } catch (error) {
      console.warn("Narration settings could not be saved to local storage.", error);
      this.publishTelemetry({ type: "voice_fallback_used", payload: { reason: "settings_storage_unavailable" } });
    }
    this.publishView();
  }

  private publishSkipped(cue: NarrationCue, reason: string): void {
    this.publishTelemetry({ type: "narration_skipped", payload: { cueId: cue.id, reason } });
  }

  private publishTelemetry(event: NarrationTelemetryDraft): void {
    this.options.onTelemetry?.(event);
  }

  private publishView(): void {
    this.options.onViewChange?.(this.viewState);
  }

  private armIdleTimer(): void {
    if (!this.options.cues.some((cue) => cue.trigger === "idle")) {
      return;
    }
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
    }
    const idleAfterMs = this.options.idleAfterMs ?? 60_000;
    this.idleTimer = setTimeout(() => {
      const idleForMs = Math.max(0, this.now() - this.lastActivityAt);
      this.options.events.emit("idle", {
        type: "idle",
        payload: { moduleId: this.options.moduleId, idleForMs },
      });
    }, idleAfterMs);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function loadSettings(
  storage: SettingsStorage | undefined,
  onFailure: (error: unknown) => void,
): NarrationSettings {
  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const storedValue = storage.getItem(SETTINGS_KEY);
    if (storedValue === null) {
      return { ...DEFAULT_SETTINGS };
    }
    const value: unknown = JSON.parse(storedValue);
    if (typeof value !== "object" || value === null) {
      onFailure(new Error("Stored narration settings are not an object."));
      return { ...DEFAULT_SETTINGS };
    }
    const settings = value as Record<string, unknown>;
    if (settings.version !== undefined && settings.version !== 1) {
      onFailure(new Error("Stored narration settings use an unsupported version."));
      return { ...DEFAULT_SETTINGS };
    }
    return {
      muted: typeof settings.muted === "boolean" ? settings.muted : DEFAULT_SETTINGS.muted,
      speed: settings.speed === 0.75 || settings.speed === 1.25 ? settings.speed : 1,
      captionsEnabled: typeof settings.captionsEnabled === "boolean"
        ? settings.captionsEnabled
        : DEFAULT_SETTINGS.captionsEnabled,
      soundEnabled: typeof settings.soundEnabled === "boolean" ? settings.soundEnabled : false,
    };
  } catch (error) {
    onFailure(error);
    return { ...DEFAULT_SETTINGS };
  }
}

function textFromVtt(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "WEBVTT" && !/^\d+$/.test(line) && !line.includes(" --> "))
    .join(" ");
}

function getBrowserStorage(): SettingsStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch (error) {
    console.warn("Narration settings could not access local storage.", error);
    return undefined;
  }
}

function getBrowserDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}