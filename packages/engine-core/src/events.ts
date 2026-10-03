import type { TelemetryEvent } from "@mma/schema";

/** Progression through the three manifest hint levels. */
export type HintLevel = "nudge" | "clue" | "explanation";

/** Payload contracts for learning events emitted by engine-core. */
export interface LearningEventPayloads {
  mission_started: { missionId: string };
  mission_completed: {
    missionId: string;
    attempts: number;
    hintsUsed: number;
    assessmentIds?: readonly string[];
  };
  mission_failed: {
    missionId: string;
    attempts: number;
    hintsUsed: number;
    reason: "give_up" | "limit_reached";
  };
  hint_used: {
    missionId: string;
    hintLevel: HintLevel;
    hintIndex: number;
  };
  assessment_answered: {
    assessmentId: string;
    selectedOptionIndex: number;
    correct: boolean;
  };
  comfort_break_shown: { missionId: string | null };
  narration_played: { cueId: string; trigger: string };
  narration_skipped: { cueId: string; reason: string };
  voice_fallback_used: { reason: string };
}

/** Telemetry event envelopes, narrowed by event type and payload. */
type TelemetryLearningEventMap = {
  [Type in keyof LearningEventPayloads]: Omit<TelemetryEvent, "type" | "payload"> & {
    type: Type;
    payload: LearningEventPayloads[Type];
  };
};

/** Local-only module signals used to trigger scripted narration. */
export interface LearningSignalPayloads {
  module_started: { moduleId: string };
  invalid_placement: { missionId: string | null; particle: string; target: string };
  idle: { moduleId: string; idleForMs: number };
}

/** Telemetry envelopes and local trigger signals published on the core event bus. */
export type LearningEventMap = TelemetryLearningEventMap & {
  [Type in keyof LearningSignalPayloads]: {
    type: Type;
    payload: LearningSignalPayloads[Type];
  };
};

/** The event details a dispatch projector supplies before the envelope is added. */
export type LearningEventDraft = {
  [Type in keyof LearningEventPayloads]: {
    type: Type;
    payload: LearningEventPayloads[Type];
  };
}[keyof LearningEventPayloads];

/** Typed publish/subscribe bus for learning telemetry events. */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(event: unknown) => void>>();

  /** Subscribe to one event type and return an unsubscribe function. */
  subscribe<Type extends keyof Events>(
    type: Type,
    listener: (event: Events[Type]) => void,
  ): () => void {
    const wrapped = (event: unknown): void => listener(event as Events[Type]);
    const listeners = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
    listeners.add(wrapped);
    this.listeners.set(type, listeners);

    return () => {
      listeners.delete(wrapped);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /** Publish an event to a snapshot of listeners for its type. */
  emit<Type extends keyof Events>(type: Type, event: Events[Type]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }
}