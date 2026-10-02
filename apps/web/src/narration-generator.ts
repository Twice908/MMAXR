import { PiperWebTtsAdapter } from "@mma/generate-narration/piper-web-adapter";
import manifest from "../../../modules/chem-atom-builder/module.json";
import moduleStarted from "../../../modules/chem-atom-builder/narration/en/module-started.json";
import carbon12Start from "../../../modules/chem-atom-builder/narration/en/build-carbon-12-start.json";
import carbon12Complete from "../../../modules/chem-atom-builder/narration/en/build-carbon-12-complete.json";
import sodiumStart from "../../../modules/chem-atom-builder/narration/en/make-na-plus-start.json";
import sodiumComplete from "../../../modules/chem-atom-builder/narration/en/make-na-plus-complete.json";
import carbon14Start from "../../../modules/chem-atom-builder/narration/en/build-carbon-14-start.json";
import carbon14Complete from "../../../modules/chem-atom-builder/narration/en/build-carbon-14-complete.json";
import chlorideStart from "../../../modules/chem-atom-builder/narration/en/make-cl-minus-start.json";
import chlorideComplete from "../../../modules/chem-atom-builder/narration/en/make-cl-minus-complete.json";
import invalidPlacement from "../../../modules/chem-atom-builder/narration/en/invalid-placement.json";
import { createBrowserAudioProcessor, createOpfsNarrationOutputCache, createPiperRuntime } from "./piper-browser.js";
import "./narration-generator.css";

interface Script {
  readonly text: string;
  readonly spokenText?: string;
  readonly reviewStatus: "pending" | "reviewed";
}

const scripts: Readonly<Record<string, Script>> = {
  "narration/en/module-started.json": asScript(moduleStarted),
  "narration/en/build-carbon-12-start.json": asScript(carbon12Start),
  "narration/en/build-carbon-12-complete.json": asScript(carbon12Complete),
  "narration/en/make-na-plus-start.json": asScript(sodiumStart),
  "narration/en/make-na-plus-complete.json": asScript(sodiumComplete),
  "narration/en/build-carbon-14-start.json": asScript(carbon14Start),
  "narration/en/build-carbon-14-complete.json": asScript(carbon14Complete),
  "narration/en/make-cl-minus-start.json": asScript(chlorideStart),
  "narration/en/make-cl-minus-complete.json": asScript(chlorideComplete),
  "narration/en/invalid-placement.json": asScript(invalidPlacement),
};

const cues = manifest.narration?.cues ?? [];
const lessonAudioBudgetBytes = 5 * 1024 * 1024;

export function mountNarrationGenerator(root: HTMLElement): void {
  root.innerHTML = `
    <main class="narration-generator" aria-labelledby="generator-title">
      <header class="generator-header">
        <a href="/" aria-label="Return to Atom Builder">Atom Builder</a>
        <span>Local narration tool</span>
      </header>
      <section class="generator-content">
        <h1 id="generator-title">Generate lesson audio</h1>
        <dl class="generator-settings">
          <div><dt>Voice</dt><dd id="generator-voice"></dd></div>
          <div><dt>Format</dt><dd>MP3, mono, 64 kbps</dd></div>
          <div><dt>Voice storage</dt><dd>Browser OPFS</dd></div>
        </dl>
        <button id="generate-narration" type="button">Generate all 10 cues</button>
        <p id="generator-status" role="status" aria-live="polite">Ready. Generation starts only when requested.</p>
        <progress id="generator-progress" max="10" value="0" hidden></progress>
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
  if (!voiceLabel || !button || !status || !progress || !results) {
    throw new Error("Narration generator controls could not be initialized.");
  }
  voiceLabel.textContent = voice;
  status.dataset.exitStatus = "0";
  button.addEventListener("click", () => {
    button.disabled = true;
    status.setAttribute("role", "status");
    status.dataset.exitStatus = "1";
    progress.hidden = false;
    void generateAll(voice, status, progress, results)
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
  voiceId: string,
  status: HTMLElement,
  progress: HTMLProgressElement,
  results: HTMLOListElement,
): Promise<void> {
  const unresolved = cues.filter((cue) => scripts[cue.script]?.reviewStatus !== "reviewed");
  if (unresolved.length > 0) {
    throw new Error(`Generation stopped: ${unresolved.length} narration scripts are not reviewed.`);
  }

  results.replaceChildren();
  progress.value = 0;
  let totalAudioBytes = 0;
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
      results.append(createCueResult(cue.id, output.audioBytes, output.captionsVtt, output.durationMs, output.peak, output.rms));
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
): HTMLLIElement {
  const item = document.createElement("li");
  const heading = document.createElement("h2");
  heading.textContent = cueId;
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