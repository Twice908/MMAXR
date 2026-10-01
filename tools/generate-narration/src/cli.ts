import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SilentMockTtsAdapter } from "./adapter.js";
import { generateNarration } from "./generate.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const moduleArgument = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
const moduleRoot = resolve(moduleArgument ?? `${repositoryRoot}/modules/chem-atom-builder`);
const requireReviewed = process.argv.includes("--require-reviewed");
const audibleTest = process.argv.includes("--audible-test");
if (audibleTest && process.env.NODE_ENV === "production") {
  throw new Error("Audible mock tones are available only in development mode.");
}
const result = await generateNarration({
  moduleRoot,
  adapter: new SilentMockTtsAdapter(audibleTest ? "audible-test" : "silent"),
  requireReviewed,
  audibleTest,
});
const pendingCount = result.cues.filter((cue) => cue.reviewStatus === "pending").length;
console.info(
  `Generated ${result.cues.length} narration cues with ${result.adapter}; ` +
  `${pendingCount} pending review; release ready: ${result.releaseReady}.`,
);