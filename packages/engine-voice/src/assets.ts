import type { EventBus, LearningEventMap, TelemetryContext } from "@mma/engine-core";
import { telemetryEventSchema } from "@mma/schema";
import type { NarrationTelemetryDraft } from "./player.js";

/** A module's bundled narration files, as `import.meta.glob` returns them. */
export interface NarrationAssetSources {
  /** Audio URLs (or inline `data:` URLs) keyed by glob path, such as `../narration/en/generated/x.mp3`. */
  readonly audioUrls: Readonly<Record<string, string>>;
  /** VTT caption text keyed by glob path. */
  readonly captions: Readonly<Record<string, string>>;
  /** Prefix between a manifest path and a glob key. Defaults to `../` (globs written from `src/`). */
  readonly keyPrefix?: string;
  /**
   * Development only: play the audible test tones from `generated/audible-test/` instead
   * of the real clips (used by the browser tests).
   */
  readonly audibleTest?: boolean;
  readonly fetch?: typeof globalThis.fetch;
}

/** The `loadAudio` and `loadCaptions` callbacks a `NarrationPlayer` needs. */
export interface NarrationAssetLoader {
  loadAudio(assetPath: string): Promise<ArrayBuffer>;
  loadCaptions(assetPath: string): Promise<string>;
}

/** Load a module's narration audio and captions from its bundled files. Shared by every module. */
export function createNarrationAssetLoader(sources: NarrationAssetSources): NarrationAssetLoader {
  const prefix = sources.keyPrefix ?? "../";
  const fetchAsset = sources.fetch ?? ((input: RequestInfo | URL) => globalThis.fetch(input));
  return {
    async loadAudio(assetPath) {
      const selected = sources.audibleTest
        ? assetPath.replace("/generated/", "/generated/audible-test/").replace(/\.mp3$/, ".wav.gz")
        : assetPath;
      const assetUrl = sources.audioUrls[`${prefix}${selected}`];
      if (!assetUrl) {
        throw new Error(`Narration audio asset is missing: ${assetPath}`);
      }
      if (!assetUrl.startsWith("data:")) {
        const response = await fetchAsset(assetUrl);
        if (!response.ok) {
          throw new Error(`Narration audio request failed with HTTP ${response.status}: ${assetPath}`);
        }
        return response.arrayBuffer();
      }
      const encoded = assetUrl.split(",", 2)[1];
      if (!encoded) {
        throw new Error(`Narration audio is not bundled inline: ${assetPath}`);
      }
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes.buffer;
    },
    async loadCaptions(assetPath) {
      const text = sources.captions[`${prefix}${assetPath}`];
      if (!text) {
        throw new Error(`Narration captions are missing: ${assetPath}`);
      }
      return text;
    },
  };
}

/** Validate a narration telemetry draft and publish it on the module's learning event bus. */
export function publishNarrationTelemetry(
  draft: NarrationTelemetryDraft,
  events: EventBus<LearningEventMap>,
  context: TelemetryContext,
  clock: () => string,
  idGenerator: () => string,
): void {
  const event = telemetryEventSchema.parse({
    ...context,
    eventId: idGenerator(),
    ts: clock(),
    type: draft.type,
    payload: draft.payload,
  });
  switch (draft.type) {
    case "narration_played":
      events.emit("narration_played", event as LearningEventMap["narration_played"]);
      break;
    case "narration_skipped":
      events.emit("narration_skipped", event as LearningEventMap["narration_skipped"]);
      break;
    case "voice_fallback_used":
      events.emit("voice_fallback_used", event as LearningEventMap["voice_fallback_used"]);
      break;
  }
}
