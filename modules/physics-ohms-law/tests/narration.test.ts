import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import rawManifest from "../module.json";

const manifest = moduleManifestSchema.parse(rawManifest);
const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cues = manifest.narration?.cues ?? [];

describe("Ohm's Law narration", () => {
  it("speaks at the start, when each mission starts and ends, and after a wrong placement", () => {
    expect(cues.map((cue) => `${cue.trigger}:${cue.missionId ?? ""}`)).toEqual([
      "module_started:",
      ...manifest.missions.flatMap((mission) => [`mission_started:${mission.id}`, `mission_completed:${mission.id}`]),
      "invalid_placement:",
    ]);
  });

  it("has a script, an MP3 and captions for every cue, with scripts pending the teacher's review", () => {
    for (const cue of cues) {
      for (const file of [cue.script, cue.audio, cue.captions]) {
        expect(file && existsSync(resolve(moduleRoot, file)), `${cue.id}: ${file}`).toBe(true);
      }
      const script = JSON.parse(readFileSync(resolve(moduleRoot, cue.script), "utf8")) as { text: string; reviewStatus: string };
      expect(script.reviewStatus).toBe("pending");
      // Captions show the written text, sentence by sentence.
      const captions = readFileSync(resolve(moduleRoot, cue.captions ?? ""), "utf8");
      expect(captions.startsWith("WEBVTT")).toBe(true);
      expect(captions).toContain(script.text.split(". ")[0]);
    }
  });

  it("keeps symbols out of the spoken words", () => {
    for (const cue of cues) {
      const script = JSON.parse(readFileSync(resolve(moduleRoot, cue.script), "utf8")) as { text: string; spokenText?: string };
      expect(script.spokenText ?? script.text, cue.id).not.toMatch(/[÷Ω+−]/);
    }
  });
});
