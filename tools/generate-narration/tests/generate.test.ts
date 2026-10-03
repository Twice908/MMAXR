import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SilentMockTtsAdapter } from "../src/adapter.js";
import { generateNarration, validateNarrationScriptFiles } from "../src/generate.js";

const cue = {
  id: "intro",
  trigger: "module_started" as const,
  script: "narration/en/intro.json",
  audio: "narration/en/generated/intro.wav.gz",
  captions: "narration/en/generated/intro.vtt",
  captionText: "Welcome to the lesson.",
};

describe("narration generation", () => {
  it("rejects a cue when its referenced script file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "mma-narration-"));
    try {
      await expect(validateNarrationScriptFiles([cue], root))
        .rejects.toThrow("Narration script file is missing: narration/en/intro.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("generates compressed placeholder audio and timed captions for pending scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "mma-narration-"));
    try {
      await mkdir(join(root, "narration/en"), { recursive: true });
      await writeFile(join(root, "narration/en/intro.json"), JSON.stringify({
        text: "Welcome to the lesson.",
        reviewStatus: "pending",
      }));
      await writeFile(join(root, "module.json"), JSON.stringify({
        schemaVersion: "1.0",
        releaseStatus: "draft",
        id: "chem.sample",
        title: { en: "Sample" },
        subject: "chemistry",
        kit: "chemistry",
        concepts: ["sci.chem.atom.structure"],
        boards: ["CBSE"],
        levels: [{ id: "class9-10", classes: [9], features: ["particles"] }],
        modes: ["screen"],
        estimatedMinutes: 1,
        assets: [],
        interactions: { manipulate: ["grab"], simulate: ["update"], missions: [], check: [] },
        missions: [],
        rulesPlugin: "./src/index.ts",
        narration: {
          languages: ["en"],
          cues: [cue],
          guide: { enabled: false, allowedActions: [], groundingDocs: [] },
        },
      }));
      const result = await generateNarration({
        moduleRoot: root,
        adapter: new SilentMockTtsAdapter(),
      });

      expect(result.releaseReady).toBe(false);
      expect(result.cues).toHaveLength(1);
      const generatedCue = result.cues[0]!;
      const audio = await import("node:fs/promises").then(({ readFile }) =>
        readFile(join(root, generatedCue.audioPath)),
      );
      const captions = await import("node:fs/promises").then(({ readFile }) =>
        readFile(join(root, generatedCue.captionsPath), "utf8"),
      );
      expect(generatedCue.audioPath).toBe(".mock-narration/intro.wav.gz");
      expect(generatedCue.captionsPath).toBe(".mock-narration/intro.vtt");
      expect(audio.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
      expect(captions).toContain("WEBVTT");
      expect(captions).toContain("Welcome to the lesson.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("generates audible test assets under generated/audible-test when audibleTest is enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "mma-narration-"));
    try {
      await mkdir(join(root, "narration/en"), { recursive: true });
      await writeFile(join(root, "narration/en/intro.json"), JSON.stringify({
        text: "Welcome to the lesson.",
        reviewStatus: "pending",
      }));
      await writeFile(join(root, "module.json"), JSON.stringify({
        schemaVersion: "1.0",
        releaseStatus: "draft",
        id: "chem.sample",
        title: { en: "Sample" },
        subject: "chemistry",
        kit: "chemistry",
        concepts: ["sci.chem.atom.structure"],
        boards: ["CBSE"],
        levels: [{ id: "class9-10", classes: [9], features: ["particles"] }],
        modes: ["screen"],
        estimatedMinutes: 1,
        assets: [],
        interactions: { manipulate: ["grab"], simulate: ["update"], missions: [], check: [] },
        missions: [],
        rulesPlugin: "./src/index.ts",
        narration: {
          languages: ["en"],
          cues: [cue],
          guide: { enabled: false, allowedActions: [], groundingDocs: [] },
        },
      }));
      const result = await generateNarration({
        moduleRoot: root,
        adapter: new SilentMockTtsAdapter("audible-test"),
        audibleTest: true,
      });

      expect(result.cues).toHaveLength(1);
      const generatedCue = result.cues[0]!;
      expect(generatedCue.audioPath).toBe("narration/en/generated/audible-test/intro.wav.gz");
      expect(generatedCue.captionsPath).toBe("narration/en/generated/audible-test/intro.vtt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses release generation until all scripts are reviewed", async () => {
    const root = await mkdtemp(join(tmpdir(), "mma-narration-"));
    try {
      await mkdir(join(root, "narration/en"), { recursive: true });
      await writeFile(join(root, "narration/en/intro.json"), JSON.stringify({
        text: "Welcome to the lesson.",
        reviewStatus: "pending",
      }));
      await writeFile(join(root, "module.json"), JSON.stringify({
        schemaVersion: "1.0",
        releaseStatus: "draft",
        id: "chem.sample",
        title: { en: "Sample" },
        subject: "chemistry",
        kit: "chemistry",
        concepts: ["sci.chem.atom.structure"],
        boards: ["CBSE"],
        levels: [{ id: "class9-10", classes: [9], features: ["particles"] }],
        modes: ["screen"],
        estimatedMinutes: 1,
        assets: [],
        interactions: { manipulate: ["grab"], simulate: ["update"], missions: [], check: [] },
        missions: [],
        rulesPlugin: "./src/index.ts",
        narration: {
          languages: ["en"],
          cues: [cue],
          guide: { enabled: false, allowedActions: [], groundingDocs: [] },
        },
      }));

      await expect(generateNarration({
        moduleRoot: root,
        adapter: new SilentMockTtsAdapter(),
        requireReviewed: true,
      })).rejects.toThrow("requires every script to be reviewed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});