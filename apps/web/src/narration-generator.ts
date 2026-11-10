import { PiperWebTtsAdapter } from "@mma/generate-narration/piper-web-adapter";
import "./narration-generator.css";

interface Script {
  readonly text: string;
  readonly spokenText?: string;
  readonly reviewStatus: "pending" | "reviewed";
}

interface Cue {
  readonly id: string;
  readonly trigger: string;
  readonly script: string;
}

/** One module that has narration cues, found from its manifest. */
interface NarrationModule {
  readonly id: string;
  readonly title: string;
  /** Folder under `modules/`, where the downloads belong. */
  readonly folder: string;
  readonly cues: readonly Cue[];
  /** Scripts by their manifest path, such as `narration/en/module-started.json`. */
  readonly scripts: Readonly<Record<string, Script>>;
}

interface RawManifest {
  readonly id: string;
  readonly title: Readonly<Record<string, string>>;
  readonly narration?: { readonly cues: readonly Cue[] };
}

// Every module's manifest and narration scripts, so one tool serves all modules.
const manifestFiles = import.meta.glob<RawManifest>("../../../modules/*/module.json", { eager: true, import: "default" });
const scriptFiles = import.meta.glob<Script>("../../../modules/*/narration/en/*.json", { eager: true, import: "default" });

/** Modules with narration, Atom Builder first (the default). */
export const narrationModules: readonly NarrationModule[] = Object.entries(manifestFiles)
  .flatMap(([path, manifest]): NarrationModule[] => {
    const folder = path.split("/").at(-2) ?? "";
    const cues = manifest.narration?.cues ?? [];
    if (cues.length === 0) return [];
    const scripts = Object.fromEntries(Object.entries(scriptFiles)
      .filter(([scriptPath]) => scriptPath.startsWith(`../../../modules/${folder}/`))
      .map(([scriptPath, script]) => [scriptPath.slice(`../../../modules/${folder}/`.length), asScript(script)]));
    return [{ id: manifest.id, title: manifest.title.en ?? manifest.id, folder, cues, scripts }];
  })
  .sort((left, right) => Number(right.id === "chem.atom-builder") - Number(left.id === "chem.atom-builder") || left.id.localeCompare(right.id));

const lessonAudioBudgetBytes = 5 * 1024 * 1024;

/** Mount the generator. `?narration-generator=<module id>` picks the module; Atom Builder is the default. */
export function mountNarrationGenerator(root: HTMLElement): void {
  const requested = new URLSearchParams(window.location.search).get("narration-generator");
  const initial = narrationModules.find((module) => module.id === requested) ?? narrationModules[0];
  if (!initial) throw new Error("No module has narration cues.");
  let selected: NarrationModule = initial;
  root.innerHTML = `
    <main class="narration-generator" aria-labelledby="generator-title">
      <header class="generator-header">
        <a href="/" aria-label="Return to the experiments">Experiments</a>
        <span>Local narration tool</span>
      </header>
      <section class="generator-content">
        <h1 id="generator-title">Generate lesson audio</h1>
        <label class="generator-module">Module
          <select id="generator-module">${narrationModules.map((module) => `<option value="${module.id}">${module.title}</option>`).join("")}</select>
        </label>
        <dl class="generator-settings">
          <div><dt>Voice</dt><dd id="generator-voice"></dd></div>
          <div><dt>Format</dt><dd>MP3, mono, 64 kbps</dd></div>
          <div><dt>Voice storage</dt><dd>Browser OPFS</dd></div>
          <div><dt>Save files to</dt><dd id="generator-folder"></dd></div>
        </dl>
        <label class="generator-draft" id="generator-draft-row" hidden>
          <input type="checkbox" id="generator-draft"> Include scripts still pending teacher review (draft audio)
        </label>
        <button id="generate-narration" type="button"></button>
        <p id="generator-status" role="status" aria-live="polite">Ready. Generation starts only when requested.</p>
        <progress id="generator-progress" max="1" value="0" hidden></progress>
        <ol id="generator-results" class="generator-results"></ol>
      </section>
    </main>
  `;

  const voice = __PIPER_VOICE_ID__ || "en_GB-jenny_dioco-medium";
  const voiceLabel = root.querySelector<HTMLElement>("#generator-voice");
  const button = root.querySelector<HTMLButtonElement>("#generate-narration");
  const status = root.querySelector<HTMLElement>("#generator-status");
  const progress = root.querySelector<HTMLProgressElement>("#generator-progress");
  const results = root.querySelector<HTMLOListElement>("#generator-results");
  const moduleSelect = root.querySelector<HTMLSelectElement>("#generator-module");
  const folder = root.querySelector<HTMLElement>("#generator-folder");
  const draftRow = root.querySelector<HTMLElement>("#generator-draft-row");
  const draft = root.querySelector<HTMLInputElement>("#generator-draft");
  if (!voiceLabel || !button || !status || !progress || !results || !moduleSelect || !folder || !draftRow || !draft) {
    throw new Error("Narration generator controls could not be initialized.");
  }
  voiceLabel.textContent = voice;
  const showModule = (module: NarrationModule): void => {
    selected = module;
    moduleSelect.value = module.id;
    folder.textContent = `modules/${module.folder}/narration/en/generated/`;
    button.textContent = `Generate all ${module.cues.length} cues`;
    progress.max = module.cues.length;
    const pending = module.cues.filter((cue) => module.scripts[cue.script]?.reviewStatus !== "reviewed").length;
    draftRow.hidden = pending === 0;
    draft.checked = false;
    results.replaceChildren();
  };
  showModule(selected);
  moduleSelect.addEventListener("change", () => {
    const module = narrationModules.find((candidate) => candidate.id === moduleSelect.value);
    if (module) showModule(module);
  });
  status.dataset.exitStatus = "0";
  button.addEventListener("click", () => {
    button.disabled = true;
    status.setAttribute("role", "status");
    status.dataset.exitStatus = "1";
    progress.hidden = false;
    void generateAll(selected, draft.checked, voice, status, progress, results)
      .catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "Narration generation failed.";
        status.setAttribute("role", "alert");
        status.dataset.exitStatus = "1";
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}

async function generateAll(
  module: NarrationModule,
  allowPending: boolean,
  voiceId: string,
  status: HTMLElement,
  progress: HTMLProgressElement,
  results: HTMLOListElement,
): Promise<void> {
  const { cues, scripts } = module;
  const unresolved = cues.filter((cue) => scripts[cue.script]?.reviewStatus !== "reviewed");
  if (unresolved.length > 0 && !allowPending) {
    throw new Error(`Generation stopped: ${unresolved.length} narration scripts are not reviewed.`);
  }

  results.replaceChildren();
  progress.value = 0;
  let totalAudioBytes = 0;
  const { createBrowserAudioProcessor, createOpfsNarrationOutputCache, createPiperRuntime } =
    await import("./piper-browser.js");
  const runtime = createPiperRuntime(__PIPER_BASE_PATH__ ?? "");
  const adapter = new PiperWebTtsAdapter({
    voiceId,
    runtime,
    audio: createBrowserAudioProcessor(),
    cache: createOpfsNarrationOutputCache(),
    onProgress: ({ loaded, total }) => {
      const percentage = total ? ` ${Math.round((loaded / total) * 100)}%` : "";
      status.textContent = `Preparing voice model: ${formatBytes(loaded)}${total ? ` of ${formatBytes(total)}` : ""}${percentage}`;
    },
  });

  try {
    for (const [index, cue] of cues.entries()) {
      const script = scripts[cue.script];
      if (!script) {
        throw new Error(`Narration script is missing: ${cue.script}`);
      }
      status.textContent = `Generating ${index + 1} of ${cues.length}: ${cue.id}`;
      const output = await adapter.synthesize({
        text: script.text,
        displayText: script.text,
        ...(script.spokenText === undefined ? {} : { spokenText: script.spokenText }),
        language: "en",
        cueType: cue.trigger,
      });
      totalAudioBytes += output.audioBytes.byteLength;
      if (totalAudioBytes > lessonAudioBudgetBytes) {
        throw new Error("Generated audio exceeds the 5 MB per-lesson budget.");
      }
      if (output.peak === undefined || output.rms === undefined) {
        throw new Error(`Narration quality metrics are missing for cue ${cue.id}.`);
      }
      results.append(createCueResult(
        cue.id,
        output.audioBytes,
        output.captionsVtt,
        output.durationMs,
        output.peak,
        output.rms,
        script.reviewStatus === "pending",
      ));
      progress.value = index + 1;
    }
    status.textContent = `Ready: ${cues.length} cues, ${formatBytes(totalAudioBytes)} total. Download the MP3 and VTT files below.`;
    status.dataset.exitStatus = "0";
  } finally {
    runtime.destroy();
  }
}

function createCueResult(
  cueId: string,
  audioBytes: Uint8Array,
  captions: string,
  durationMs: number,
  peak: number,
  rms: number,
  pendingReview: boolean,
): HTMLLIElement {
  const item = document.createElement("li");
  const heading = document.createElement("h2");
  heading.textContent = pendingReview ? `${cueId} (draft: script pending review)` : cueId;
  const details = document.createElement("p");
  details.textContent = `${(durationMs / 1_000).toFixed(1)} seconds · ${formatBytes(audioBytes.byteLength)} · peak ${peak.toFixed(3)} · RMS ${rms.toFixed(3)}`;
  const audioBlob = new Blob([Uint8Array.from(audioBytes).buffer as ArrayBuffer], { type: "audio/mpeg" });
  item.append(heading, details, createDownloadLink(audioBlob, `${cueId}.mp3`, "Download MP3"));
  item.append(createDownloadLink(new Blob([captions], { type: "text/vtt" }), `${cueId}.vtt`, "Download captions"));
  const audioPreview = document.createElement("audio");
  audioPreview.controls = true;
  audioPreview.preload = "none";
  audioPreview.src = URL.createObjectURL(audioBlob);
  audioPreview.addEventListener("ended", () => URL.revokeObjectURL(audioPreview.src), { once: true });
  item.append(audioPreview);
  return item;
}

function createDownloadLink(blob: Blob, filename: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.textContent = label;
  return link;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function asScript(value: { readonly text: string; readonly spokenText?: string; readonly reviewStatus: string }): Script {
  if (value.reviewStatus !== "reviewed" && value.reviewStatus !== "pending") {
    throw new Error("Narration script has an invalid review status.");
  }
  return {
    text: value.text,
    ...(value.spokenText === undefined ? {} : { spokenText: value.spokenText }),
    reviewStatus: value.reviewStatus,
  };
}