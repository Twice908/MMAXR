import "./shell.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root element is missing");
}

app.className = "app-shell";
app.innerHTML = '<div class="shell-loading" role="status">Loading Atom Builder...</div>';

void import("@mma/chem-atom-builder")
  .then(({ manifest, mountAtomBuilder }) => {
    if (manifest.modes[0] !== "screen") {
      throw new Error("This build supports the screen mode only.");
    }
    mountAtomBuilder(app, { diagnostics: import.meta.env.DEV });
  })
  .catch((error: unknown) => {
    app.replaceChildren();
    const message = document.createElement("p");
    message.className = "shell-error";
    message.setAttribute("role", "alert");
    message.textContent = error instanceof Error ? error.message : "Atom Builder could not be loaded.";
    app.append(message);
  });