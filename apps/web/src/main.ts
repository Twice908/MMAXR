import "./shell.css";
import "./camera-view.css";
import { createIdGenerator } from "@mma/engine-core";
import { mountCameraView } from "./camera-view.js";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("App root element is missing");
}
const app: HTMLElement = appRoot;

app.className = "app-shell";
app.innerHTML = '<div class="shell-loading" role="status">Loading Atom Builder...</div>';

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("narration-generator")) {
  void import("./narration-generator.js")
    .then(({ mountNarrationGenerator }) => mountNarrationGenerator(app))
    .catch(showLoadError);
} else {
  void import("@mma/chem-atom-builder")
    .then(({ manifest, mountAtomBuilder }) => {
      if (manifest.modes[0] !== "screen") {
        throw new Error("This build supports the screen mode only.");
      }
      mountAtomBuilder(app, { diagnostics: import.meta.env.DEV });
      const sceneHost = app.querySelector<HTMLElement>(".scene-viewport");
      if (!sceneHost) {
        throw new Error("Camera view could not find the screen scene.");
      }
      const idGenerator = createIdGenerator({
        crypto: globalThis.crypto,
        now: Date.now,
      });
      mountCameraView({
        root: app,
        sceneHost,
        telemetryContext: {
          studentRef: idGenerator(),
          sessionId: idGenerator(),
          moduleId: manifest.id,
          moduleVersion: "0.0.0",
          device: { mode: "screen", tier: "mid" },
        },
        clock: () => new Date().toISOString(),
        idGenerator,
        diagnostics: import.meta.env.DEV,
      });
    })
    .catch(showLoadError);
}

function showLoadError(error: unknown): void {
  app.replaceChildren();
  const message = document.createElement("p");
  message.className = "shell-error";
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error ? error.message : "Atom Builder could not be loaded.";
  app.append(message);
}