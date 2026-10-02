import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { ModuleManifest } from "@mma/schema";
import type { TtsAdapter } from "./adapter.js";

/** Source text and review state for one narration script. */
export interface NarrationScript {
  readonly text: string;
  readonly spokenText?: string;
  readonly reviewStatus: "pending" | "reviewed";
}

/** Summary of one generated narration asset pair. */
export interface GeneratedNarrationCue {
  readonly cueId: string;
  readonly audioPath: string;
  readonly captionsPath: string;
  readonly durationMs: number;
  readonly reviewStatus: NarrationScript["reviewStatus"];
}

/** Result for one module generation run. */
export interface GenerateNarrationResult {
  readonly adapter: string;
  readonly releaseReady: boolean;
  readonly cues: readonly GeneratedNarrationCue[];
}

/** Options for validating and generating a module's narration assets. */
export interface GenerateNarrationOptions {
  readonly moduleRoot: string;
  readonly adapter: TtsAdapter;
  readonly requireReviewed?: boolean;
  readonly audibleTest?: boolean;
}

/**
 * Validate every cue script path before generation. Script paths are constrained
 * to the module directory so malformed manifests cannot read unrelated files.
 */
export async function validateNarrationScriptFiles(
  cues: NonNullable<ModuleManifest["narration"]>["cues"],
  moduleRoot: string,
): Promise<ReadonlyMap<string, NarrationScript>> {
  const scripts = new Map<string, NarrationScript>();
  for (const cue of cues) {
    const path = resolveModulePath(moduleRoot, cue.script);
    try {
      await access(path);
    } catch {
      throw new Error(`Narration script file is missing: ${cue.script}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new Error(`Narration script is not valid JSON: ${cue.script}`);
    }
    if (!isNarrationScript(parsed)) {
      throw new Error(`Narration script must have text and reviewStatus: ${cue.script}`);
    }
    if ((parsed.spokenText ?? parsed.text).trim().split(/\s+/).filter(Boolean).length > 40) {
      throw new Error(`Narration script exceeds 40 words: ${cue.script}`);
    }
    if (cue.captionText && cue.captionText !== parsed.text) {
      throw new Error(`Narration caption text must match its script: ${cue.id}`);
    }
    scripts.set(cue.id, parsed);
  }
  return scripts;
}

/** Read a module manifest, validate script files, and generate compressed audio and captions. */
export async function generateNarration(
  options: GenerateNarrationOptions,
): Promise<GenerateNarrationResult> {
  const manifestPath = resolve(options.moduleRoot, "module.json");
  const rawManifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = parseNarrationManifest(rawManifest);
  if (!manifest.narration) {
    throw new Error("Module manifest does not define a narration block.");
  }
  const scripts = await validateNarrationScriptFiles(manifest.narration.cues, options.moduleRoot);
  const releaseReady = [...scripts.values()].every((script) => script.reviewStatus === "reviewed");
  if (options.requireReviewed && !releaseReady) {
    throw new Error("Narration generation for release requires every script to be reviewed.");
  }

  const generated: GeneratedNarrationCue[] = [];
  for (const cue of manifest.narration.cues) {
    const script = scripts.get(cue.id);
    if (!script || !cue.audio || !cue.captions) {
      throw new Error(`Narration cue must define a script, audio, and captions output: ${cue.id}`);
    }
    const output = await options.adapter.synthesize({
      text: script.text,
      displayText: script.text,
      ...(script.spokenText === undefined ? {} : { spokenText: script.spokenText }),
      language: manifest.narration.languages[0]!,
      cueType: cue.trigger,
    });
    const isMockAdapter = options.adapter.name.includes("mock");
    const mockOutputDirectory = resolve(
      options.moduleRoot,
      ".mock-narration",
      ...(options.audibleTest ? ["audible-test"] : []),
    );
    const audioPath = isMockAdapter
      ? resolve(mockOutputDirectory, `${cue.id}.wav.gz`)
      : resolveModulePath(options.moduleRoot, cue.audio);
    const captionsPath = isMockAdapter
      ? resolve(mockOutputDirectory, `${cue.id}.vtt`)
      : resolveModulePath(options.moduleRoot, cue.captions);
    await mkdir(dirname(audioPath), { recursive: true });
    await mkdir(dirname(captionsPath), { recursive: true });
    await writeFile(audioPath, output.audioBytes);
    await writeFile(captionsPath, output.captionsVtt, "utf8");
    generated.push({
      cueId: cue.id,
      audioPath: relative(options.moduleRoot, audioPath).split(sep).join("/"),
      captionsPath: relative(options.moduleRoot, captionsPath).split(sep).join("/"),
      durationMs: output.durationMs,
      reviewStatus: script.reviewStatus,
    });
  }
  return { adapter: options.adapter.name, releaseReady, cues: generated };
}

function resolveModulePath(moduleRoot: string, relativePath: string): string {
  const root = resolve(moduleRoot);
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}${sep}`)) {
    throw new Error(`Narration path must remain inside the module: ${relativePath}`);
  }
  return path;
}

function isNarrationScript(value: unknown): value is NarrationScript {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const script = value as Record<string, unknown>;
  return typeof script.text === "string" && script.text.trim().length > 0 &&
    (script.spokenText === undefined || (typeof script.spokenText === "string" && script.spokenText.trim().length > 0)) &&
    (script.reviewStatus === "pending" || script.reviewStatus === "reviewed");
}

function parseNarrationManifest(value: unknown): ModuleManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Module manifest must be a JSON object.");
  }
  const manifest = value as Record<string, unknown>;
  const narration = manifest.narration;
  if (typeof narration !== "object" || narration === null) {
    throw new Error("Module manifest does not define a narration block.");
  }
  const block = narration as Record<string, unknown>;
  if (
    !Array.isArray(block.languages) || typeof block.languages[0] !== "string" ||
    !Array.isArray(block.cues) || !block.cues.every(isNarrationCueRecord)
  ) {
    throw new Error("Narration block must define languages and cues.");
  }
  return value as ModuleManifest;
}

function isNarrationCueRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const cue = value as Record<string, unknown>;
  return typeof cue.id === "string" && typeof cue.script === "string" &&
    (typeof cue.captions === "string" || typeof cue.captionText === "string");
}