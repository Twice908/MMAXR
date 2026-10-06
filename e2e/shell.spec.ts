import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

declare global {
  interface Window {
    __dispatchMockXrSelect: (target: Element) => void;
    readonly __mockXrSelectCount: number;
    __setMockXrCamera: (x: number, y: number, z: number) => void;
    __cameraStreams: MediaStream[];
    __cameraGetUserMediaCalls: MediaStreamConstraints[];
    __cameraFailureName?: string;
  }
}

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("shows the three subjects without loading an experience", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("http://127.0.0.1:5174/#/");
  await expect(page.getByRole("heading", { name: "Welcome. What would you like to explore?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chemistry, 1 experience" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Physics, 0 experiences" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Biology, 0 experiences" })).toBeVisible();
  await expect(page.getByText("Experiences are on the way")).toHaveCount(2);
  await expect(page.locator("#atom-scene canvas")).toHaveCount(0);
  expect(requests.some((url) => /(?:^|\/)three(?:\.module)?\.js/.test(url))).toBe(false);
});

test("navigates from Chemistry to Atom Builder and back", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/#/");
  await page.getByRole("link", { name: "Chemistry, 1 experience" }).click();
  await expect(page).toHaveURL(/#\/subject\/chemistry$/);
  await page.getByRole("link", { name: /Atom Builder/ }).click();
  await expect(page.getByRole("heading", { name: "Atom Builder" })).toBeVisible();
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await page.getByRole("link", { name: "Back to Chemistry" }).click();
  await expect(page).toHaveURL(/#\/subject\/chemistry$/);
  await expect(page.getByRole("heading", { name: "Chemistry" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Start" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { name: "Welcome. What would you like to explore?" })).toBeVisible();
});

test("returns to Start with a notice for an unknown route", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/#/not-a-route");
  await expect(page.getByRole("status")).toContainText("That page was not found");
  await expect(page.getByRole("link", { name: "Chemistry, 1 experience" })).toBeVisible();
});

test("opens a module from the legacy query and exposes developer tools", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/?module=chem.atom-builder");
  await expect(page.getByRole("heading", { name: "Atom Builder" })).toBeVisible();
  await page.goto("http://127.0.0.1:5174/#/");
  await expect(page.getByRole("heading", { name: "Developer tools" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Visual gallery" })).toHaveAttribute("href", /\?gallery/);
  await expect(page.getByRole("link", { name: "Narration generator" })).toHaveAttribute("href", /\?narration-generator/);
});

test("lazy-loads Atom Builder and mounts the screen canvas", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.getByRole("heading", { name: "Atom Builder" })).toBeVisible();
  const canvas = page.locator("#atom-scene canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
  await expectCanvasHasRenderedPixels(page, canvas);

  const trayNeutron = await page.locator('[data-particle="neutron"]').boundingBox();
  const canvasBounds = await canvas.boundingBox();
  if (!trayNeutron || !canvasBounds) {
    throw new Error("Atom Builder drag surfaces are missing");
  }
  const ringRadius = 0.83;
  const pixelsPerUnit = canvasBounds.height / (2 * Math.tan(42 * Math.PI / 360) * 14);
  const start = { x: trayNeutron.x + trayNeutron.width / 2, y: trayNeutron.y + trayNeutron.height / 2 };
  const drop = {
    x: canvasBounds.x + canvasBounds.width / 2 + ringRadius * pixelsPerUnit,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#neutron-count")).toHaveText("0");
  await expect(page.locator("#chemistry-feedback")).toHaveText(
    "Protons and neutrons belong in the nucleus, not on an electron shell.",
  );
  await expect(page.locator('[data-particle="neutron"]')).toHaveClass(/is-rejected/);

  await page.getByRole("button", { name: "Add proton" }).click();
  await expect(page.locator("#atomic-number")).toHaveText("2");
  await page.getByRole("button", { name: "Reset atom" }).click();
  await expect(page.locator("#atomic-number")).toHaveText("1");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectCanvasHasRenderedPixels(page, canvas);
});

test("hides camera view only for touch-first AR devices or missing camera access", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => true },
    });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const result = nativeMatchMedia(query);
      if (query === "(any-pointer: fine)") {
        Object.defineProperty(result, "matches", { configurable: true, value: false });
      }
      return result;
    };
  });
  await page.goto(MODULE_URL);
  await expect(page.getByRole("button", { name: "Camera view" })).toBeHidden();
  await expect(page.locator(".camera-view-reason")).toContainText("touch-first device");

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => false },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Camera view" })).toBeHidden();
  await expect(page.locator(".camera-view-reason")).toContainText("does not provide camera access");
});

test("mounts and emits telemetry when crypto.randomUUID is unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(MODULE_URL);
  await expect(page.getByRole("heading", { name: "Build carbon-12" })).toBeVisible();
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator("#dev-event-panel")).toContainText("mission_started");
  expect(pageErrors).toEqual([]);
});

test("waits for a gesture before playing bundled mock narration", async ({ page }) => {
  await page.goto(MODULE_URL);
  const enableSound = page.getByRole("button", { name: "Tap to enable sound" });
  await expect(enableSound).toBeVisible();

  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await expect(eventPanel).toBeVisible();
  await expect(eventPanel).not.toContainText("narration_played");
  await enableSound.click();
  await expect(eventPanel).toContainText("narration_played");
});

test("plays bundled Piper MP3 and loads its timed captions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(MODULE_URL);
  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(eventPanel).toContainText("narration_played");
  await expect(eventPanel).not.toContainText("voice_fallback_used");
  await expect(page.locator("#narration-caption")).toBeVisible();
  await expect(page.locator("#narration-caption")).not.toBeEmpty();
  expect(pageErrors).toEqual([]);
});

test("changes narration speed mid-cue without playback errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const playbackErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") playbackErrors.push(message.text());
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#dev-event-panel")).toContainText("narration_played");
  const speed = page.getByLabel("Narration speed");
  await speed.selectOption("0.75");
  await expect(speed).toHaveValue("0.75");
  await speed.selectOption("1.25");
  await expect(speed).toHaveValue("1.25");
  await expect(page.locator("#narration-caption")).not.toBeEmpty();
  await expect(page.locator("#narration-audio-status")).not.toContainText("playback failed");
  expect(pageErrors).toEqual([]);
  expect(playbackErrors).toEqual([]);
});

test("loads the opt-in audible mock assets in development", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/?narrationAudio=audible-test#/module/chem.atom-builder");
  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(eventPanel).toContainText("narration_played");
  await expect(eventPanel).not.toContainText("voice_fallback_used");
});

test("opens the narration generator only by explicit development query and waits for a click", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("http://127.0.0.1:5174/?narration-generator");
  await expect(page.getByRole("heading", { name: "Generate lesson audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate all 10 cues" })).toBeEnabled();
  await expect(page.getByRole("progressbar")).toBeHidden();
  expect(requests.some((url) => url.includes("voices.json") || url.endsWith(".onnx"))).toBe(false);
});

test("fails visibly with nonzero generation status when the configured Piper voice is unknown", async ({ page }) => {
  test.slow();
  await page.route("**/voices.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  }));
  await page.goto("http://127.0.0.1:5174/?narration-generator");
  await page.getByRole("button", { name: "Generate all 10 cues" }).click();
  const status = page.locator("#generator-status");
  await expect(status).toHaveAttribute("role", "alert");
  await expect(status).toHaveAttribute("data-exit-status", "1");
  await expect(status).toContainText("Unknown Piper voice");
  await expect(page.locator(".generator-results li")).toHaveCount(0);
});

test("committed narration MP3s decode as plausible non-silent speech", async ({ page }) => {
  const moduleRoot = resolve(process.cwd(), "modules/chem-atom-builder");
  const manifest = JSON.parse(await readFile(resolve(moduleRoot, "module.json"), "utf8"));
  const clips = await Promise.all(manifest.narration.cues.map(async (cue: {
    readonly id: string;
    readonly script: string;
    readonly audio: string;
  }) => {
    const script = JSON.parse(await readFile(resolve(moduleRoot, cue.script), "utf8"));
    const audioBytes = await readFile(resolve(moduleRoot, cue.audio));
    return {
      id: cue.id,
      spokenText: script.spokenText ?? script.text,
      audioBytes: Array.from(audioBytes),
      fileSizeBytes: audioBytes.byteLength,
    };
  }));

  await page.goto(MODULE_URL);
  const metrics = await page.evaluate(async (assets) => {
    const context = new AudioContext();
    try {
      return await Promise.all(assets.map(async (asset) => {
        const audioBuffer = await context.decodeAudioData(Uint8Array.from(asset.audioBytes).buffer);
        const samples = audioBuffer.getChannelData(0);
        let peak = 0;
        let squaredTotal = 0;
        for (const sample of samples) {
          peak = Math.max(peak, Math.abs(sample));
          squaredTotal += sample * sample;
        }
        const wordCount = asset.spokenText.trim().split(/\s+/).filter(Boolean).length;
        return {
          id: asset.id,
          durationSeconds: audioBuffer.duration,
          secondsPerWord: audioBuffer.duration / wordCount,
          peak,
          rms: Math.sqrt(squaredTotal / samples.length),
          fileSizeBytes: asset.fileSizeBytes,
        };
      }));
    } finally {
      await context.close();
    }
  }, clips);

  expect(metrics).toHaveLength(10);
  for (const clip of metrics) {
    expect(clip.secondsPerWord, `${clip.id} duration per word`).toBeGreaterThanOrEqual(0.2);
    expect(clip.secondsPerWord, `${clip.id} duration per word`).toBeLessThanOrEqual(0.8);
    expect(clip.peak, `${clip.id} peak`).toBeGreaterThan(0.02);
    expect(clip.rms, `${clip.id} RMS`).toBeGreaterThan(0.005);
    expect(clip.fileSizeBytes, `${clip.id} file size`).toBeGreaterThan(1_000);
  }
});

test("shows a sound-blocked hint when HTML audio play is rejected after a tap", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function (): Promise<void> {
      return Promise.reject(new DOMException("Playback is not allowed", "NotAllowedError"));
    };
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#narration-audio-status")).toHaveText("Sound blocked. Tap to try again.");
  await expect(page.getByRole("button", { name: "Tap to enable sound" })).toBeVisible();
  expect(warnings).toContain(
    "Narration sound is blocked: HTML audio remained unavailable after the user gesture.",
  );
});

test("restores narration preferences after reload but still requires a sound gesture", async ({ page }) => {
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#narration-audio-status")).toHaveText("Sound enabled");
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.locator("#narration-speed").selectOption("1.25");
  await page.getByRole("button", { name: "Captions on" }).click();
  await expect.poll(() => page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("mma.narration.settings.v1") ?? "null");
    return settings;
  })).toEqual({
    version: 1,
    muted: true,
    speed: 1.25,
    captionsEnabled: false,
    soundEnabled: true,
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "Tap to enable sound" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unmute", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#narration-speed")).toHaveValue("1.25");
  await expect(page.getByRole("button", { name: "Captions off" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#narration-audio-status")).toHaveText("Sound waits for your tap.");
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem("mma.narration.settings.v1") ?? "null",
  ).soundEnabled)).toBe(true);
});

test("completes every mission muted with captions, including M2", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.getByRole("heading", { name: "Build carbon-12" })).toBeVisible();
  await expect(page.locator("#mission-progress")).toHaveText("Progress 1/4");
  await expect(page.locator("#narration-caption")).toContainText("Build carbon-12");
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute", exact: true }))
    .toHaveAttribute("aria-pressed", "true");

  await addParticles(page, "Add proton", 5);
  await addParticles(page, "Add neutron", 6);
  await addParticles(page, "Add electron", 5);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("#mission-feedback")).toContainText("Goal met");
  await page.getByRole("button", { name: "B. 6", exact: true }).click();
  await expect(page.locator("#assessment-feedback")).toContainText("Correct.");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "D. 6", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Make Na+" })).toBeVisible();
  await expect(page.locator("#narration-caption")).toContainText("Now make Na+");
  await page.getByRole("button", { name: "Reset atom" }).click();
  await addParticles(page, "Add proton", 10);
  await addParticles(page, "Add neutron", 12);
  await addParticles(page, "Add electron", 9);
  await expect(page.locator("#element-symbol")).toHaveText("Na");
  await expect(page.locator("#atom-charge")).toHaveText("+1");
  await expect(page.locator("#electron-configuration")).toHaveText("2,8");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("#mission-feedback")).toContainText("Goal met");
  await page.getByRole("button", { name: "A. 10", exact: true }).click();
  await expect(page.locator("#assessment-feedback")).toContainText("Correct.");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "C. 2,8", exact: true }).click();
  await expect(page.locator("#assessment-feedback")).toContainText("Correct.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build carbon-14" })).toBeVisible();

  await page.getByRole("button", { name: "Reset atom" }).click();
  await addParticles(page, "Add proton", 5);
  await addParticles(page, "Add neutron", 8);
  await addParticles(page, "Add electron", 5);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("#mission-feedback")).toContainText("Goal met");
  await page.getByRole("button", { name: "D. 8", exact: true }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "B. 6", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Make Cl-" })).toBeVisible();
  await page.getByRole("button", { name: "Reset atom" }).click();
  await addParticles(page, "Add proton", 16);
  await addParticles(page, "Add neutron", 18);
  await addParticles(page, "Add electron", 17);
  await expect(page.locator("#electron-configuration")).toHaveText("2,8,8");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("#mission-feedback")).toContainText("Goal met");
  await page.getByRole("button", { name: "C. 18", exact: true }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "A. Configuration 2,8,8; complete outer shell", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(page.locator("#narration-caption")).toContainText("complete outer shell");
  await expect(page.getByRole("button", { name: "Unmute", exact: true }))
    .toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Events" }).click();
  const eventPanel = page.locator("#dev-event-panel");
  await expect(eventPanel).toBeVisible();
  await expect(eventPanel).toContainText("mission_completed");
  await expect(eventPanel).toContainText("assessment_answered");
  await expect(eventPanel).toContainText("narration_skipped");
});

test("opens recent events after M2 and reports no browser console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(MODULE_URL);
  await addParticles(page, "Add proton", 5);
  await addParticles(page, "Add neutron", 6);
  await addParticles(page, "Add electron", 5);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "B. 6", exact: true }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "D. 6", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make Na+" })).toBeVisible();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await page.getByRole("button", { name: "Reset atom" }).click();
  await addParticles(page, "Add proton", 10);
  await addParticles(page, "Add neutron", 12);
  await addParticles(page, "Add electron", 9);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator("#mission-feedback")).toContainText("Goal met");
  await expect(page.getByRole("button", { name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Events" }).click();

  const eventPanel = page.locator("#dev-event-panel");
  await expect(eventPanel).toContainText("mission_completed");
  await expect(eventPanel.locator('[data-event-type="mission_completed"]')
    .filter({ hasText: "make-na-plus" })).toHaveCount(1);
  await expect(eventPanel).toContainText("narration_played");
  await expect(eventPanel.locator("time").first()).toHaveAttribute("datetime", /T/);
  expect(consoleErrors).toEqual([]);
});

test("shows the next electron shell and keeps the drag label off the drop point", async ({ page }) => {
  await page.goto(MODULE_URL);
  const canvas = page.locator("#atom-scene canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Add electron" }).click();
  await expect(page.locator("#electron-count")).toHaveText("2");
  await expect(page.locator("#electron-configuration")).toHaveText("2");

  const trayElectron = await page.locator('[data-particle="electron"]').boundingBox();
  const canvasBounds = await canvas.boundingBox();
  if (!trayElectron || !canvasBounds) {
    throw new Error("Electron drag surfaces are missing");
  }
  const shellTwoRadius = 1.51;
  const pixelsPerUnit = canvasBounds.height / (2 * Math.tan(42 * Math.PI / 360) * 14);
  const start = {
    x: trayElectron.x + trayElectron.width / 2,
    y: trayElectron.y + trayElectron.height / 2,
  };
  const drop = {
    x: canvasBounds.x + canvasBounds.width / 2 + shellTwoRadius * pixelsPerUnit + 12,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 8 });
  await expect(page.locator(".drop-slot-layer")).toHaveClass(/is-visible/);
  await expect(page.locator(".drop-slot-marker.is-active")).toHaveCount(1);
  const dragLabel = await page.locator("#drag-ghost").boundingBox();
  expect(dragLabel).not.toBeNull();
  expect(dragLabel!.x).toBeGreaterThanOrEqual(drop.x);
  expect(dragLabel!.y + dragLabel!.height).toBeLessThan(drop.y);
  await page.mouse.up();

  await expect(page.locator("#electron-count")).toHaveText("3");
  await expect(page.locator("#electron-configuration")).toHaveText("2,1");
});

test("hides AR entry and explains unsupported devices", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => false },
    });
  });
  await page.goto(MODULE_URL);

  await expect(page.getByRole("button", { name: "View in AR" })).toBeHidden();
  await expect(page.locator("#ar-support-message")).toContainText(
    "does not support immersive AR",
  );
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
});

test("AR overlay is transparent and camera explanation has two visible actions", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => {
          document.documentElement.dataset.arRequest = "requested";
          throw new DOMException("not started", "NotAllowedError");
        },
      },
    });
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "View in AR" }).click();

  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel AR" });
  const start = dialog.getByRole("button", { name: "Start AR" });
  await expect(cancel).toBeVisible();
  await expect(start).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(2);
  await expect(dialog).toContainText(
    "Stay seated, look around you, and keep an eye on your surroundings.",
  );
  for (const button of [cancel, start]) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
  const primaryStyle = await start.evaluate((element) => ({
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
    primaryText: (() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement)
        .getPropertyValue("--glass-primary-text").trim();
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    })(),
    primaryBackground: getComputedStyle(document.documentElement).getPropertyValue("--glass-primary-bg").trim(),
  }));
  expect(primaryStyle.color).toBe(primaryStyle.primaryText);
  expect(primaryStyle.background).toBe(primaryStyle.primaryBackground);
  await dialog.locator(".ar-confirmation-actions").click({ position: { x: 4, y: 24 } });
  expect(await page.locator("html").getAttribute("data-ar-request")).toBeNull();
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.classList.add("ar-active");
    document.body.classList.add("ar-active");
    document.querySelector("#app")?.classList.add("ar-active");
  });
  const activeStyles = await page.evaluate(() => {
    const selectors = [
      "html", "body", "#app", ".atom-builder", ".builder-header", ".lesson-panel",
      ".narration-hud", ".builder-content", ".particle-rail", ".atom-workspace",
      ".scene-viewport", ".atom-inspector",
    ];
    return {
      backgrounds: selectors.map((selector) => getComputedStyle(document.querySelector(selector)!).backgroundColor),
      backgroundImages: selectors.map((selector) => getComputedStyle(document.querySelector(selector)!).backgroundImage),
      canvasDisplay: getComputedStyle(document.querySelector("#atom-scene canvas")!).display,
    };
  });
  expect(activeStyles.backgrounds.every((value) => value === "rgba(0, 0, 0, 0)")).toBe(true);
  expect(activeStyles.backgroundImages.every((value) => value === "none")).toBe(true);
  expect(activeStyles.canvasDisplay).toBe("none");
});

test("glass surfaces use tokens and fall back for reduced transparency", async ({ page }) => {
  await installMockXr(page);
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "View in AR" }).click();
  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await expect(dialog).toBeVisible();

  const normalDialogStyle = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      background: style.backgroundColor,
      filter: style.backdropFilter,
      glassBackground: root.getPropertyValue("--glass-bg").trim(),
      strongBackground: root.getPropertyValue("--glass-bg-strong").trim(),
      supportsBackdropFilter: CSS.supports("backdrop-filter", "blur(1px)")
        || CSS.supports("-webkit-backdrop-filter", "blur(1px)"),
    };
  });
  expect(normalDialogStyle.background).toBe(
    normalDialogStyle.supportsBackdropFilter
      ? normalDialogStyle.glassBackground
      : normalDialogStyle.strongBackground,
  );
  if (normalDialogStyle.supportsBackdropFilter) {
    expect(normalDialogStyle.filter).toContain("blur(14px)");
  } else {
    expect(normalDialogStyle.filter).toBe("none");
  }

  await page.emulateMedia({ reducedTransparency: "reduce" });
  const transparencyEmulator = await page.context().newCDPSession(page);
  await transparencyEmulator.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  expect(await page.evaluate(() =>
    matchMedia("(prefers-reduced-transparency: reduce)").matches,
  )).toBe(true);
  const reducedTransparencyStyle = await dialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    filter: getComputedStyle(element).backdropFilter,
    strongBackground: getComputedStyle(document.documentElement)
      .getPropertyValue("--glass-bg-strong").trim(),
  }));
  expect(reducedTransparencyStyle.background).toBe(reducedTransparencyStyle.strongBackground);
  expect(reducedTransparencyStyle.filter).toBe("none");

  await transparencyEmulator.send("Emulation.setEmulatedMedia", { features: [] });
  await page.emulateMedia({ reducedTransparency: "no-preference", contrast: "more" });
  const highContrastStyle = await dialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    filter: getComputedStyle(element).backdropFilter,
    strongBackground: getComputedStyle(document.documentElement)
      .getPropertyValue("--glass-bg-strong").trim(),
  }));
  expect(highContrastStyle.background).toBe(highContrastStyle.strongBackground);
  expect(highContrastStyle.filter).toBe("none");
});

test("mocked AR keeps the atom world-fixed and exposes the lesson through its overlay", async ({ page }) => {
  await installMockXr(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "View in AR" }).click();
  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await dialog.getByRole("button", { name: "Start AR" }).click();

  const exitButton = page.getByRole("button", { name: "Exit AR" });
  await expect(exitButton).toBeVisible();
  const panel = page.locator(".ar-overlay-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/is-collapsed/);
  await expect(panel).toContainText("Build carbon-12");
  const collapsedGlassStyle = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      background: style.backgroundColor,
      glassBackground: root.getPropertyValue("--glass-bg").trim(),
      strongBackground: root.getPropertyValue("--glass-bg-strong").trim(),
      text: style.color,
      glassText: (() => {
        const probe = document.createElement("span");
        probe.style.color = root.getPropertyValue("--glass-text").trim();
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })(),
      radius: style.borderRadius,
      glassRadius: root.getPropertyValue("--glass-radius-panel").trim(),
    };
  });
  expect(collapsedGlassStyle.background).toBe(collapsedGlassStyle.glassBackground);
  expect(collapsedGlassStyle.text).toBe(collapsedGlassStyle.glassText);
  expect(collapsedGlassStyle.radius).toBe(collapsedGlassStyle.glassRadius);
  const collapsedPanelBox = await panel.boundingBox();
  expect(collapsedPanelBox?.height).toBeLessThanOrEqual(60);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect(page.locator(".ar-diagnostics")).toContainText("anchor 0.00,0.00,-0.60");
  await expect(page.locator(".ar-diagnostics")).toContainText("view 1.00x");

  const viewStateBeforeGestures = await page.evaluate(() => ({
    atomicNumber: document.querySelector("#atomic-number")?.textContent,
    protonCount: document.querySelector("#proton-count")?.textContent,
    neutronCount: document.querySelector("#neutron-count")?.textContent,
    electronCount: document.querySelector("#electron-count")?.textContent,
    missionProgress: document.querySelector("#mission-progress")?.textContent,
    localEventCount: document.querySelectorAll("#dev-event-list li").length,
  }));
  const gestureResults = await page.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    const root = document.querySelector<HTMLElement>(".module-mount");
    if (!root) {
      throw new Error("App overlay root is missing");
    }
    const dispatchTouch = (
      target: HTMLElement,
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => target.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: "touch",
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }));
    const diagnostics = document.querySelector<HTMLElement>(".ar-diagnostics");
    if (!diagnostics) {
      throw new Error("AR diagnostics are missing");
    }
    const snapshots: string[] = [];
    dispatchTouch(root, "pointerdown", 11, 100, 300);
    dispatchTouch(root, "pointerdown", 12, 200, 300);
    dispatchTouch(root, "pointermove", 12, 250, 300);
    dispatchTouch(root, "pointerup", 11, 100, 300);
    dispatchTouch(root, "pointerup", 12, 250, 300);
    snapshots.push(diagnostics.textContent ?? "");

    dispatchTouch(root, "pointerdown", 13, 100, 300);
    dispatchTouch(root, "pointermove", 13, 120, 320);
    dispatchTouch(root, "pointerup", 13, 120, 320);
    snapshots.push(diagnostics.textContent ?? "");

    const exit = document.querySelector<HTMLElement>(".ar-exit");
    if (!exit) {
      throw new Error("AR exit control is missing");
    }
    dispatchTouch(exit, "pointerdown", 14, 350, 20);
    dispatchTouch(root, "pointermove", 14, 370, 40);
    dispatchTouch(root, "pointerup", 14, 370, 40);
    snapshots.push(diagnostics.textContent ?? "");

    dispatchTouch(root, "pointerdown", 21, 100, 300);
    dispatchTouch(root, "pointerdown", 22, 200, 300);
    dispatchTouch(root, "pointermove", 22, 10_000, 300);
    dispatchTouch(root, "pointerup", 21, 100, 300);
    dispatchTouch(root, "pointerup", 22, 10_000, 300);
    snapshots.push(diagnostics.textContent ?? "");

    dispatchTouch(root, "pointerdown", 23, 100, 300);
    dispatchTouch(root, "pointerdown", 24, 1_100, 300);
    dispatchTouch(root, "pointermove", 24, 100, 300);
    dispatchTouch(root, "pointerup", 23, 100, 300);
    dispatchTouch(root, "pointerup", 24, 100, 300);
    snapshots.push(diagnostics.textContent ?? "");

    dispatchTouch(root, "pointerdown", 25, 100, 300);
    dispatchTouch(root, "pointermove", 25, 100, 10_000);
    dispatchTouch(root, "pointerup", 25, 100, 10_000);
    snapshots.push(diagnostics.textContent ?? "");
    dispatchTouch(root, "pointerdown", 26, 100, 10_000);
    dispatchTouch(root, "pointermove", 26, 100, -10_000);
    dispatchTouch(root, "pointerup", 26, 100, -10_000);
    snapshots.push(diagnostics.textContent ?? "");

    return snapshots;
  });
  expect(gestureResults[0]).toContain("view 1.40x");
  expect(gestureResults[1]).toContain("rotation -0.12,0.12");
  expect(gestureResults[2]).toContain("rotation -0.12,0.12");
  expect(gestureResults[3]).toContain("view 2.00x");
  expect(gestureResults[4]).toContain("view 0.50x");
  expect(gestureResults[5]).toContain("rotation -0.12,1.05");
  expect(gestureResults[6]).toContain("rotation -0.12,-1.05");
  expect(gestureResults[6]).toContain("anchor 0.00,0.00,-0.60");

  const viewStateAfterGestures = await page.evaluate(() => ({
    atomicNumber: document.querySelector("#atomic-number")?.textContent,
    protonCount: document.querySelector("#proton-count")?.textContent,
    neutronCount: document.querySelector("#neutron-count")?.textContent,
    electronCount: document.querySelector("#electron-count")?.textContent,
    missionProgress: document.querySelector("#mission-progress")?.textContent,
    localEventCount: document.querySelectorAll("#dev-event-list li").length,
  }));
  expect(viewStateAfterGestures).toEqual(viewStateBeforeGestures);

  await page.locator(".ar-panel-heading").getByRole("button", { name: "Reset view" }).click();
  await expect(page.locator(".ar-diagnostics")).toContainText("view 1.00x");
  await expect(page.locator(".ar-diagnostics")).toContainText("rotation 0.00,0.00");

  await page.evaluate(() => {
    const panelButton = document.querySelector(".ar-overlay-panel button");
    if (!panelButton) {
      throw new Error("AR panel toggle is missing");
    }
    window.__dispatchMockXrSelect(panelButton);
  });
  expect(await page.evaluate(() => window.__mockXrSelectCount)).toBe(0);

  await page.evaluate(() => window.__setMockXrCamera(0.25, 0.1, 0));
  await expect(page.locator(".ar-diagnostics")).toContainText("camera 0.25,0.10,0.00");
  await expect(page.locator(".ar-diagnostics")).toContainText("anchor 0.00,0.00,-0.60");

  await panel.getByRole("button", { name: "Show panel" }).click();
  await expect(panel).not.toHaveClass(/is-collapsed/);
  await expect(panel.locator("#lesson-panel")).toBeVisible();
  const expandedPanelBounds = await panel.boundingBox();
  expect(expandedPanelBounds?.y).toBeGreaterThanOrEqual(844 / 2);
  expect(expandedPanelBounds?.width).toBeLessThanOrEqual(390 - 24);
  await expect(panel.locator(".narration-controls")).toBeVisible();
  await expect(panel.locator(".particle-rail")).toBeVisible();
  await expect(panel.locator(".tray-particle").first()).toBeVisible();
  await expect(panel.locator("#assessment-card")).toBeHidden();
  const controlGlassStyles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`Missing AR glass control: ${selector}`);
      }
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        minHeight: Number.parseFloat(style.minHeight),
      };
    };
    return {
      glassBackground: root.getPropertyValue("--glass-bg").trim(),
      glassText: (() => {
        const probe = document.createElement("span");
        probe.style.color = root.getPropertyValue("--glass-text").trim();
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })(),
      primaryBackground: root.getPropertyValue("--glass-primary-bg").trim(),
      primaryText: (() => {
        const probe = document.createElement("span");
        probe.style.color = root.getPropertyValue("--glass-primary-text").trim();
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })(),
      dangerBackground: root.getPropertyValue("--glass-danger-bg").trim(),
      dangerText: (() => {
        const probe = document.createElement("span");
        probe.style.color = root.getPropertyValue("--glass-danger-text").trim();
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      })(),
      hint: read('.ar-overlay-panel [data-command="lesson:hint"]'),
      check: read('.ar-overlay-panel [data-command="lesson:check"]'),
      stepper: read(".ar-overlay-panel .stepper button"),
      narration: read('.ar-overlay-panel [data-narration-action="mute"]'),
      caption: read(".ar-overlay-panel .narration-caption"),
      missionTitle: read(".ar-panel-mission-title"),
      resetView: read('.ar-panel-heading [data-ar-action="reset-view"]'),
      panelToggle: read('.ar-panel-heading [data-ar-action="panel-toggle"]'),
      exit: read(".ar-exit"),
    };
  });
  for (const control of [
    controlGlassStyles.hint,
    controlGlassStyles.stepper,
    controlGlassStyles.narration,
    controlGlassStyles.caption,
    controlGlassStyles.missionTitle,
    controlGlassStyles.resetView,
    controlGlassStyles.panelToggle,
  ]) {
    expect(control.background).toBe(controlGlassStyles.glassBackground);
    expect(control.color).toBe(controlGlassStyles.glassText);
  }
  expect(controlGlassStyles.check.background).toBe(controlGlassStyles.primaryBackground);
  expect(controlGlassStyles.check.color).toBe(controlGlassStyles.primaryText);
  expect(controlGlassStyles.exit.background).toBe(controlGlassStyles.dangerBackground);
  expect(controlGlassStyles.exit.color).toBe(controlGlassStyles.dangerText);
  for (const control of [
    controlGlassStyles.hint,
    controlGlassStyles.check,
    controlGlassStyles.stepper,
    controlGlassStyles.narration,
    controlGlassStyles.panelToggle,
    controlGlassStyles.resetView,
    controlGlassStyles.exit,
  ]) {
    expect(control.minHeight).toBeGreaterThanOrEqual(44);
  }
  await panel.getByRole("button", { name: "Add proton" }).click();
  await expect(page.locator("#atomic-number")).toHaveText("2");
  await panel.getByRole("button", { name: "Hint" }).click();
  await expect(panel.locator("#hint-feedback")).not.toBeEmpty();
  await panel.getByRole("button", { name: "Check" }).click();
  await expect(panel.locator("#mission-feedback")).toContainText("Not yet");
  const captionsButton = panel.getByRole("button", { name: "Captions on" });
  await captionsButton.click();
  await expect(panel.getByRole("button", { name: "Captions off" })).toHaveAttribute("aria-pressed", "false");
  await panel.getByLabel("Narration speed").selectOption("0.75");
  await expect(panel.getByLabel("Narration speed")).toHaveValue("0.75");

  await addParticles(page, "Add proton", 4);
  await addParticles(page, "Add neutron", 6);
  await addParticles(page, "Add electron", 5);
  await panel.getByRole("button", { name: "Check" }).click();
  await expect(panel.locator("#assessment-card")).toBeVisible();
  const questionSurface = await panel.locator("#assessment-card").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    glassBackground: getComputedStyle(document.documentElement).getPropertyValue("--glass-bg").trim(),
    text: getComputedStyle(element).color,
    glassText: (() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--glass-text").trim();
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    })(),
  }));
  expect(questionSurface.background).toBe(questionSurface.glassBackground);
  expect(questionSurface.text).toBe(questionSurface.glassText);
  await panel.locator("#assessment-options button").first().click();
  await expect(panel.locator("#assessment-feedback")).not.toBeEmpty();
  await panel.getByRole("button", { name: "Next question" }).click();
  await panel.locator("#assessment-options button").first().click();
  await panel.getByRole("button", { name: "Continue" }).click();
  await expect(panel).toContainText("Make Na+");

  await exitButton.click();
  await expect(exitButton).toBeHidden();
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await expect(page.locator("#atomic-number")).toHaveText("6");
  await expect(page.locator("#neutron-count")).toHaveText("6");
  await expect(page.locator("#electron-count")).toHaveText("6");
  await expect(panel).toBeHidden();
});

test("mocked AR shows one local comfort break reminder after ten minutes", async ({ page }) => {
  await page.clock.install();
  await installMockXr(page);
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "View in AR" }).click();
  await page.getByRole("dialog", { name: "View the atom in AR?" })
    .getByRole("button", { name: "Start AR" }).click();
  await expect(page.getByRole("button", { name: "Exit AR" })).toBeVisible();

  await page.clock.fastForward(10 * 60 * 1000);
  await expect(page.locator("#ar-break-reminder")).toBeVisible();
  await expect(page.locator("#ar-break-reminder")).toHaveText("Take a short break");
  const reminderSurface = await page.locator("#ar-break-reminder").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    glassBackground: getComputedStyle(document.documentElement).getPropertyValue("--glass-bg").trim(),
    text: getComputedStyle(element).color,
    glassText: (() => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--glass-text").trim();
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    })(),
  }));
  expect(reminderSurface.background).toBe(reminderSurface.glassBackground);
  expect(reminderSurface.text).toBe(reminderSurface.glassText);
  await expect(page.locator('#dev-event-list [data-event-type="comfort_break_shown"]')).toHaveCount(1);

  await page.clock.fastForward(10 * 60 * 1000);
  await expect(page.locator('#dev-event-list [data-event-type="comfort_break_shown"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Exit AR" }).click();
  await expect(page.locator("#ar-break-reminder")).toBeHidden();
});

test("explains camera use before permission and returns cleanly after denial", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => {
          document.documentElement.dataset.arRequest = "requested";
          throw new DOMException("Camera permission denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto(MODULE_URL);

  const viewInAr = page.getByRole("button", { name: "View in AR" });
  await expect(viewInAr).toBeVisible();
  await viewInAr.click();
  const explanation = page.getByRole("dialog", { name: "View the atom in AR?" });
  await expect(explanation).toContainText("Nothing is recorded or uploaded.");
  expect(await page.locator("html").getAttribute("data-ar-request")).toBeNull();

  await explanation.getByRole("button", { name: "Start AR" }).click();
  await expect(page.locator("#ar-status")).toContainText("Camera access was not allowed");
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await expect(page.locator("#atomic-number")).toHaveText("1");
  await expect(page.locator("#proton-count")).toHaveText("1");
  await expect(page.locator("#neutron-count")).toHaveText("0");

  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator('#dev-event-list [data-event-type="ar_error"]')).toContainText(
    "permission_denied",
  );
  expect(browserErrors).toEqual([]);
});

test("desktop keeps camera view available when an XR emulator reports immersive AR", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => true },
    });
  });
  await page.goto(MODULE_URL);

  await expect(page.getByRole("button", { name: "View in AR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Camera view" })).toBeVisible();
  await expect(page.locator(".camera-view-diagnostic")).toBeHidden();
});

test("reports the hidden camera-view reason for a touch-first AR device", async ({ page }) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "info") diagnostics.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => true },
    });
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const result = nativeMatchMedia(query);
      if (query === "(any-pointer: fine)") {
        Object.defineProperty(result, "matches", { configurable: true, value: false });
      }
      return result;
    };
  });
  await page.goto(MODULE_URL);

  const hiddenReason =
    "Camera view is hidden because immersive AR is available on a touch-first device.";
  await expect(page.getByRole("button", { name: "Camera view" })).toBeHidden();
  await expect(page.locator(".camera-view-reason")).toContainText(hiddenReason);
  expect(diagnostics).toContain(`Camera view hidden: ${hiddenReason}`);

  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator(".camera-view-diagnostic")).toContainText(
    `Camera view hidden: ${hiddenReason}`,
  );
});

test("desktop camera view uses a live mirrored video behind the atom and stops every track on exit", async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(window, "__cameraStreams", { value: [] });
    Object.defineProperty(window, "__cameraGetUserMediaCalls", { value: [] });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        window.__cameraGetUserMediaCalls.push(constraints);
        if (window.__cameraFailureName) {
          throw new DOMException("Mock camera failure", window.__cameraFailureName);
        }
        const stream = await originalGetUserMedia(constraints);
        window.__cameraStreams.push(stream);
        return stream;
      },
    });
  });
  await page.goto(MODULE_URL);
  await expect(page.getByRole("heading", { name: "Atom Builder" })).toBeVisible();
  const before = await page.evaluate(() => ({
    number: document.querySelector("#atomic-number")?.textContent,
    progress: document.querySelector("#mission-progress")?.textContent,
  }));
  const cameraButton = page.getByRole("button", { name: "Camera view" });
  await expect(cameraButton).toBeVisible();
  await cameraButton.click();
  const dialog = page.getByRole("dialog", { name: "Start camera view?" });
  await expect(dialog).toContainText("shown on this screen only");
  await expect(dialog).toContainText("Nothing is recorded or uploaded");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => window.__cameraGetUserMediaCalls.length)).toBe(0);

  await cameraButton.click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  const video = page.locator("#atom-scene video.camera-view-video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).videoWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Exit camera view" })).toBeVisible();
  expect(await video.evaluate((element) => ({
    muted: (element as HTMLVideoElement).muted,
    inline: (element as HTMLVideoElement).playsInline,
    mirrored: element.classList.contains("camera-view-video--mirrored"),
    objectFit: getComputedStyle(element).objectFit,
    position: getComputedStyle(element).position,
    zIndex: getComputedStyle(element).zIndex,
  }))).toEqual({
    muted: true,
    inline: true,
    mirrored: true,
    objectFit: "cover",
    position: "fixed",
    zIndex: "0",
  });
  expect(await page.locator("#atom-scene canvas").evaluate((element) => ({
    transform: getComputedStyle(element).transform,
    zIndex: getComputedStyle(element).zIndex,
  }))).toEqual({ transform: "none", zIndex: "1" });
  const videoBounds = await video.boundingBox();
  expect(videoBounds?.width).toBe(await page.evaluate(() => window.innerWidth));
  expect(videoBounds?.height).toBe(await page.evaluate(() => window.innerHeight));
  expect(await page.evaluate(() => window.__cameraGetUserMediaCalls[0]?.video))
    .toMatchObject({ facingMode: { ideal: "user" } });
  await expect(page.locator("html")).toHaveClass(/camera-active/);
  await expect(page.locator("body")).toHaveClass(/camera-active/);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  expect(await page.locator("#atom-scene canvas").evaluate((element) => {
    const gl = element.getContext("webgl2");
    return gl?.getParameter(gl.COLOR_CLEAR_VALUE)[3];
  })).toBe(0);
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator('#dev-event-list [data-event-type="camera_view_started"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Exit camera view" }).click();
  await expect(video).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/camera-active/);
  await expect(page.locator("body")).not.toHaveClass(/camera-active/);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  expect(await page.locator("#atom-scene canvas").evaluate((element) => {
    const gl = element.getContext("webgl2");
    return gl?.getParameter(gl.COLOR_CLEAR_VALUE)[3];
  })).toBe(1);
  await expect(page.getByRole("button", { name: "Camera view" })).toBeVisible();
  expect(await page.evaluate(() => window.__cameraStreams[0]?.getTracks().map((track) => track.readyState)))
    .toEqual(["ended"]);
  await expect(page.locator('#dev-event-list [data-event-type="camera_view_ended"]')).toContainText("none");
  expect(await page.evaluate(() => ({
    number: document.querySelector("#atomic-number")?.textContent,
    progress: document.querySelector("#mission-progress")?.textContent,
  }))).toEqual(before);
});

for (const [name, reason, message] of [
  ["NotAllowedError", "permission_denied", "Camera access was not allowed"],
  ["NotFoundError", "no_camera", "No camera was found"],
  ["NotReadableError", "camera_in_use", "camera is busy"],
]) {
test(`camera view returns to screen mode after ${name}`, async ({ page }) => {
  await page.addInitScript((failureName) => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => false },
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Mock camera failure", failureName);
      },
    });
  }, name);
  await page.goto(MODULE_URL);
  const numberBefore = await page.locator("#atomic-number").textContent();
  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-status")).toContainText(message);
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/camera-active/);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Camera view" })).toBeVisible();
  expect(await page.locator("#atomic-number").textContent()).toBe(numberBefore);
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator('#dev-event-list [data-event-type="camera_view_ended"]')).toContainText(reason);
});
}

test("camera view stops all tracks when the tab hides or the camera disconnects", async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(window, "__cameraStreams", { value: [] });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const stream = await originalGetUserMedia(constraints);
        window.__cameraStreams.push(stream);
        return stream;
      },
    });
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await expect(page.getByRole("button", { name: "Exit camera view" })).toBeVisible();

  await page.evaluate(() => {
    const track = window.__cameraStreams[0]?.getVideoTracks()[0];
    if (!track) throw new Error("Fake camera track is missing");
    track.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator(".camera-view-status")).toContainText("camera disconnected");
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  expect(await page.evaluate(() => window.__cameraStreams[0]?.getTracks().map((track) => track.readyState)))
    .toEqual(["ended"]);

  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".camera-view-status")).toContainText("tab is hidden");
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  expect(await page.evaluate(() => window.__cameraStreams[1]?.getTracks().map((track) => track.readyState)))
    .toEqual(["ended"]);
  await expect(page.locator("html")).not.toHaveClass(/camera-active/);
});

test("leaving during camera view stops its fake media tracks without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(window, "__cameraStreams", { value: [] });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const stream = await originalGetUserMedia(constraints);
        window.__cameraStreams.push(stream);
        return stream;
      },
    });
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await page.getByRole("link", { name: "Back to Chemistry" }).click();
  await expect(page).toHaveURL(/#\/subject\/chemistry$/);
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.__cameraStreams[0]?.getTracks().map((track) => track.readyState),
  )).toEqual(["ended"]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function installMockXr(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    for (const context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (context) {
        Object.defineProperty(context.prototype, "makeXRCompatible", {
          configurable: true,
          value: async () => undefined,
        });
      }
    }
    let cameraX = 0;
    let cameraY = 0;
    let cameraZ = 0;
    let selectCount = 0;
    let ended = false;
    const identityMatrix = (): number[] => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const viewerMatrix = (): number[] => {
      const matrix = identityMatrix();
      matrix[12] = cameraX;
      matrix[13] = cameraY;
      matrix[14] = cameraZ;
      return matrix;
    };
    const session = new EventTarget() as EventTarget & {
      enabledFeatures: string[];
      visibilityState: string;
      environmentBlendMode: string;
      domOverlayState: object;
      renderState: { baseLayer: unknown };
      inputSources: unknown[];
      updateRenderState: (state: { baseLayer: unknown }) => void;
      requestReferenceSpace: (type: string) => Promise<object>;
      requestAnimationFrame: (callback: (time: number, frame: object) => void) => number;
      cancelAnimationFrame: (handle: number) => void;
      end: () => Promise<void>;
    };
    session.enabledFeatures = ["dom-overlay"];
    session.visibilityState = "visible";
    session.environmentBlendMode = "alpha-blend";
    session.domOverlayState = {};
    session.renderState = { baseLayer: null };
    session.inputSources = [];
    session.updateRenderState = (state) => {
      session.renderState = { ...session.renderState, ...state };
    };
    session.requestReferenceSpace = async () => ({});
    const frame = {
      getViewerPose: () => ({
        views: [{
          eye: "none",
          projectionMatrix: identityMatrix(),
          transform: { matrix: viewerMatrix() },
        }],
      }),
    };
    session.requestAnimationFrame = (callback) =>
      window.requestAnimationFrame((time) => {
        if (!ended) {
          callback(time, frame);
        }
      });
    session.cancelAnimationFrame = (handle) => window.cancelAnimationFrame(handle);
    session.end = async () => {
      ended = true;
    };
    session.addEventListener("select", () => {
      selectCount += 1;
    });

    class MockXRWebGLLayer {
      framebufferWidth = 256;
      framebufferHeight = 256;
      framebuffer = null;
      ignoreDepthValues = true;

      constructor() {}

      getViewport(): { x: number; y: number; width: number; height: number } {
        return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight };
      }
    }
    Object.defineProperty(window, "XRWebGLLayer", {
      configurable: true,
      value: MockXRWebGLLayer,
    });
    const xrWebGLBinding = Reflect.get(window, "XRWebGLBinding");
    if (typeof xrWebGLBinding === "function") {
      const prototype = Reflect.get(xrWebGLBinding, "prototype");
      if (prototype && typeof prototype === "object") {
        Reflect.deleteProperty(prototype, "createProjectionLayer");
      }
    }
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => session,
      },
    });

    const mockWindow = window as Window & {
      __dispatchMockXrSelect: (target: Element) => void;
      __mockXrSelectCount: number;
      __setMockXrCamera: (x: number, y: number, z: number) => void;
    };
    Object.defineProperty(mockWindow, "__dispatchMockXrSelect", {
      value: (target: Element) => {
        const beforeSelect = new Event("beforexrselect", { bubbles: true, cancelable: true });
        target.dispatchEvent(beforeSelect);
        if (!beforeSelect.defaultPrevented) {
          session.dispatchEvent(new Event("select"));
        }
      },
    });
    Object.defineProperty(mockWindow, "__mockXrSelectCount", {
      get: () => selectCount,
    });
    Object.defineProperty(mockWindow, "__setMockXrCamera", {
      value: (x: number, y: number, z: number) => {
        cameraX = x;
        cameraY = y;
        cameraZ = z;
      },
    });
  });
}

async function addParticles(
  page: import("@playwright/test").Page,
  buttonName: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.getByRole("button", { name: buttonName, exact: true }).click();
  }
}

async function expectCanvasHasRenderedPixels(
  page: import("@playwright/test").Page,
  canvas: import("@playwright/test").Locator,
): Promise<void> {
  const screenshot = await canvas.screenshot();
  const imageDataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  const colorCount = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = image.naturalWidth;
    sampleCanvas.height = image.naturalHeight;
    const context = sampleCanvas.getContext("2d");
    if (!context) {
      return 0;
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 24) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    }
    return colors.size;
  }, imageDataUrl);
  expect(colorCount).toBeGreaterThan(10);
}