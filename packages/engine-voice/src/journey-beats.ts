import type { NarrationCueOutcome } from "./player.js";

/** The narration calls a {@link JourneyBeatRunner} needs; `NarrationPlayer` provides them. */
export interface BeatNarrator {
  playCue(cueId: string): "playing" | "silent";
  stopCurrentCue(): void;
}

/** A beat to time: its id, optional narration cue, and how long it lasts without audio. */
export interface TimedBeat {
  readonly id: string;
  readonly cueId: string | null;
  readonly durationMs: number;
}

/** Options for {@link JourneyBeatRunner}. */
export interface JourneyBeatRunnerOptions {
  /** Speaks beat cues; null runs every beat on its timer (captions only). */
  readonly narrator: BeatNarrator | null;
  /** Called once when the running beat is over; dispatch the journey's beat-ended action here. */
  readonly onBeatEnded: (beatId: string) => void;
  /** Breath after a spoken line ends, before the next beat. Defaults to 600 ms. */
  readonly pauseAfterSpeechMs?: number;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * Decide when a journey beat is over. A beat with a cue that plays ends shortly after
 * the cue ends (with a safety limit in case the end is never reported); a silent beat,
 * or one whose audio fails, ends after its own duration. Pass the player's
 * `onCueEnded` reports to {@link JourneyBeatRunner.cueEnded}.
 */
export class JourneyBeatRunner {
  private readonly options: JourneyBeatRunnerOptions;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private beat: TimedBeat | null = null;
  private timer: unknown = null;

  constructor(options: JourneyBeatRunnerOptions) {
    this.options = options;
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** The beat being timed, or null. */
  get currentBeatId(): string | null {
    return this.beat?.id ?? null;
  }

  /** Start timing a beat, replacing any beat already running. */
  run(beat: TimedBeat): void {
    this.cancelTimer();
    this.beat = beat;
    const speaking = beat.cueId !== null && this.options.narrator?.playCue(beat.cueId) === "playing";
    // playCue may already have reported a missing file, which starts the fallback timer.
    if (this.beat !== beat || this.timer !== null) return;
    // While speaking, the limit only guards against an end that is never reported.
    this.arm(speaking ? beat.durationMs * 2 + 8_000 : beat.durationMs);
  }

  /** Report how a narration cue finished (from the player's `onCueEnded`). */
  cueEnded(cueId: string, outcome: NarrationCueOutcome): void {
    const beat = this.beat;
    if (!beat || beat.cueId !== cueId) return;
    this.arm(outcome === "ended" ? this.options.pauseAfterSpeechMs ?? 600 : beat.durationMs);
  }

  /** Stop timing (and speaking) without ending the beat, for pause or leaving the beats. */
  stop(): void {
    this.cancelTimer();
    if (this.beat?.cueId) this.options.narrator?.stopCurrentCue();
    this.beat = null;
  }

  private arm(delayMs: number): void {
    this.cancelTimer();
    const beat = this.beat;
    if (!beat) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.beat !== beat) return;
      this.beat = null;
      this.options.onBeatEnded(beat.id);
    }, delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}
