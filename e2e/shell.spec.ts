import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

declare global {
  interface Window {
    __dispatchMockXrSelect: (target: Element) => void;
    readonly __mockXrSelectCount: number;
    __setMockXrCamera: (x: number, y: number, z: number) => void;
  }
}

test("keeps the WebGL canvas visible while the immersive session class is active", async ({ page }) => {
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  const canvas = page.locator("#atom-scene canvas");
  await expect(canvas).toBeVisible();
  await page.locator("#app").evaluate((root) => root.classList.add("ar-active"));
  await expect(canvas).toBeVisible();
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await expect(page.getByRole("heading", { name: "Build carbon-12" })).toBeVisible();
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator("#dev-event-panel")).toContainText("mission_started");
  expect(pageErrors).toEqual([]);
});

test("waits for a gesture before playing bundled mock narration", async ({ page }) => {
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#dev-event-panel")).toContainText("narration_played");
  const speed = page.locator("#narration-speed");
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
  await page.goto("https://127.0.0.1:5174/?narrationAudio=audible-test#/experiment/chem.atom-builder");
  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(eventPanel).toContainText("narration_played");
  await expect(eventPanel).not.toContainText("voice_fallback_used");
});

test("opens the narration generator only by explicit development query and waits for a click", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("https://127.0.0.1:5174/?narration-generator");
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
  await page.goto("https://127.0.0.1:5174/?narration-generator");
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

  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#narration-audio-status")).toHaveText("Sound blocked. Tap to try again.");
  await expect(page.getByRole("button", { name: "Tap to enable sound" })).toBeVisible();
  expect(warnings).toContain(
    "Narration sound is blocked: HTML audio remained unavailable after the user gesture.",
  );
});

test("restores narration preferences after reload but still requires a sound gesture", async ({ page }) => {
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
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

test("opens recent events after M2 and reports no browser console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
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

test("hides AR entry and explains unsupported devices", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: async () => false },
    });
  });
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");

  await expect(page.getByRole("button", { name: "Enter AR" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Enter VR" })).toBeHidden();
  await expect(page.locator("#ar-support-message")).toContainText(
    "does not support immersive AR",
  );
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
});

test("touch-first phones offer Enter AR beside Reset view and hide the phone VR viewer", async ({ page }) => {
  await installMockXr(page);
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => {
      const result = nativeMatchMedia(query);
      if (query === "(any-pointer: fine)") {
        Object.defineProperty(result, "matches", { configurable: true, value: false });
      }
      return result;
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");

  const enterAr = page.getByRole("button", { name: "Enter AR" });
  const resetView = page.locator(".scene-heading .reset-view");
  await expect(enterAr).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter VR" })).toBeHidden();
  const arBox = await enterAr.boundingBox();
  const resetBox = await resetView.boundingBox();
  expect(arBox && resetBox).toBeTruthy();
  expect(Math.round(arBox!.y)).toBe(Math.round(resetBox!.y));
  expect(arBox!.height).toBeGreaterThanOrEqual(48);
});

test("AR consent dialog explains camera use and has two clear actions", async ({ page }) => {
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Enter AR" }).click();

  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const start = dialog.getByRole("button", { name: "Start AR" });
  await expect(dialog.getByRole("button")).toHaveCount(2);
  await expect(dialog).toContainText("Nothing is recorded or uploaded.");
  await expect(dialog).toContainText("Stay seated, look around you, and keep an eye on your surroundings.");
  for (const button of [cancel, start]) {
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  }
  const colors = await start.evaluate((element) => {
    const root = getComputedStyle(document.documentElement);
    const resolve = (value: string): string => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return {
      background: getComputedStyle(element).backgroundColor,
      accent: resolve(root.getPropertyValue("--hud-accent").trim()),
    };
  });
  expect(colors.background).toBe(colors.accent);
  // No session is requested until Start is pressed.
  expect(await page.locator("html").getAttribute("data-ar-request")).toBeNull();
  await cancel.click();
  await expect(dialog).toBeHidden();

  await page.evaluate(() => {
    for (const element of [document.documentElement, document.body, document.querySelector("#app")]) {
      element?.classList.add("ar-active");
    }
  });
  const backgrounds = await page.evaluate(() =>
    ["html", "body", "#app", ".atom-builder", ".builder-content", ".atom-workspace", ".scene-viewport"]
      .map((selector) => getComputedStyle(document.querySelector(selector)!).backgroundColor));
  expect(backgrounds.every((value) => value === "rgba(0, 0, 0, 0)")).toBe(true);
});

test("a mid-start XR exception restores the screen renderer and lesson panels", async ({ page }) => {
  await installMockXr(page);
  await page.goto("https://127.0.0.1:5174?xrdebug=1&xrstartfail=1#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Enter AR" }).click();
  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await dialog.getByRole("button", { name: "Start AR" }).click();

  const status = page.locator("#ar-status");
  await expect(status).toContainText("AR could not continue. You are back in screen mode.");
  await expect(page.locator("html")).not.toHaveClass(/ar-active/);
  await expect(page.locator(".ar-exit")).toBeHidden();
  await expect(page.locator(".ar-hud")).toBeHidden();
  await expect(page.locator("#lesson-panel")).toBeVisible();
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const report = page.locator(".ar-diagnostics");
  await expect(report).toContainText("Last XR error: Forced XR start failure");
  await expect(report).toContainText("Last XR error stack:");

  const requestsBefore = await page.evaluate(() =>
    (window as Window & { __mmaRafRequests?: number }).__mmaRafRequests ?? 0,
  );
  await page.waitForTimeout(100);
  const requestsAfter = await page.evaluate(() =>
    (window as Window & { __mmaRafRequests?: number }).__mmaRafRequests ?? 0,
  );
  expect(requestsAfter).toBeGreaterThan(requestsBefore);
  await expect(status).toBeHidden({ timeout: 7000 });
});

test("a post-start XR input error ends the session and restores screen mode", async ({ page }) => {
  await installMockXr(page);
  await page.goto("https://127.0.0.1:5174?xrdebug=1&xrinputfail=1#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Enter AR" }).click();
  const dialog = page.getByRole("dialog", { name: "View the atom in AR?" });
  await dialog.getByRole("button", { name: "Start AR" }).click();

  await expect(page.locator("#ar-status"))
    .toContainText("AR could not continue. You are back in screen mode.");
  await expect(page.locator("html")).not.toHaveClass(/ar-active/);
  await expect(page.locator(".ar-hud")).toBeHidden();
  await expect(page.locator("#lesson-panel")).toBeVisible();
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await expect(page.locator(".ar-diagnostics"))
    .toContainText("Last XR error: Forced XR input initialization failure");
});

async function startMockAr(page: import("@playwright/test").Page, viewport: { width: number; height: number }): Promise<void> {
  await installMockXr(page);
  await page.setViewportSize(viewport);
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Enter AR" }).click();
  await page.getByRole("dialog", { name: "View the atom in AR?" })
    .getByRole("button", { name: "Start AR" }).click();
  await expect(page.getByRole("button", { name: "Exit AR" })).toBeVisible();
}

test("phone AR HUD: top bar, thumb-zone tabs, one sheet at a time", async ({ page }) => {
  await startMockAr(page, { width: 390, height: 844 });
  const hud = page.locator(".ar-hud");
  await expect(hud).toBeVisible();
  await expect(page.locator(".ar-hud-status")).toContainText("Build carbon-12");
  await expect(page.locator(".builder-header")).toBeHidden();
  await expect(page.locator(".scene-heading")).toBeHidden();

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "Mission" })).toHaveAttribute("aria-selected", "true");
  const sheet = page.locator(".ar-hud-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#lesson-panel")).toBeVisible();

  // Everything sits inside the viewport; tabs are in the bottom third (thumb zone).
  const tabBar = await page.locator(".ar-hud-tabs").boundingBox();
  const sheetBox = await sheet.boundingBox();
  expect(tabBar!.y).toBeGreaterThan(844 * 2 / 3);
  expect(tabBar!.y + tabBar!.height).toBeLessThanOrEqual(844);
  expect(sheetBox!.height).toBeLessThanOrEqual(844 * 0.5);
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(tabBar!.y + 1);
  for (const tab of await tabs.all()) {
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Build: steppers change the atom; tapping the open tab closes the sheet.
  await page.getByRole("tab", { name: "Build" }).click();
  await expect(page.getByRole("tab", { name: "Build" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator("#lesson-panel")).toBeHidden();
  const addProton = sheet.getByRole("button", { name: "Add proton" });
  expect((await addProton.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await addProton.click();
  await expect(page.locator("#proton-count")).toHaveText("2");
  await page.getByRole("tab", { name: "Build" }).click();
  await expect(sheet).toBeHidden();

  // Element and Sound sheets hold the inspector and narration controls.
  await page.getByRole("tab", { name: "Element" }).click();
  await expect(sheet.locator("#atomic-number")).toHaveText("2");
  await page.getByRole("tab", { name: "Sound" }).click();
  await expect(sheet.locator(".narration-controls")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Mission feedback while another sheet is open marks the Mission tab.
  await page.getByRole("tab", { name: "Build" }).click();
  await page.evaluate(() => {
    document.querySelector("#mission-feedback")!.textContent = "Not yet.";
  });
  await expect(page.locator('[data-hud-tab="mission"] .ar-hud-badge')).toBeVisible();
  await page.getByRole("tab", { name: "Mission" }).click();
  await expect(page.locator('[data-hud-tab="mission"] .ar-hud-badge')).toBeHidden();

  // Exit returns every lesson element to the page.
  await page.getByRole("button", { name: "Exit AR" }).click();
  await expect(hud).toBeHidden();
  await expect(page.locator(".builder-content .particle-rail")).toBeVisible();
  await expect(page.locator(".atom-builder > #lesson-panel")).toBeVisible();
  await expect(page.locator(".narration-hud #narration-caption")).toHaveCount(1);
});

test("phone AR HUD: touch on the open camera view turns the atom without changing the lesson", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startMockAr(page, { width: 390, height: 844 });
  await page.getByRole("tab", { name: "Mission" }).click();
  await expect(page.locator(".ar-hud-sheet")).toBeHidden();
  const before = await page.evaluate(() => document.querySelector("#atomic-number")?.textContent);
  await page.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    const target = document.elementFromPoint(195, 380) as HTMLElement;
    const touch = (type: string, x: number, y: number) => target.dispatchEvent(new PointerEvent(type, {
      pointerId: 31, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    touch("pointerdown", 195, 380);
    touch("pointermove", 260, 380);
    touch("pointerup", 260, 380);
  });
  expect(await page.evaluate(() => document.querySelector("#atomic-number")?.textContent)).toBe(before);
  expect(errors).toEqual([]);
});

test("phone AR HUD keeps the sheet beside the atom in landscape", async ({ page }) => {
  await startMockAr(page, { width: 844, height: 390 });
  const sheet = await page.locator(".ar-hud-sheet").boundingBox();
  const tabs = await page.locator(".ar-hud-tabs").boundingBox();
  expect(sheet!.x + sheet!.width).toBeLessThan(844 / 2 + 40);
  expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(390);
  expect((await page.locator(".ar-hud-tab").first().boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test("mocked AR shows one local comfort break reminder after ten minutes", async ({ page }) => {
  await page.clock.install();
  await installMockXr(page);
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");
  await page.getByRole("button", { name: "Enter AR" }).click();
  await page.getByRole("dialog", { name: "View the atom in AR?" })
    .getByRole("button", { name: "Start AR" }).click();
  await expect(page.getByRole("button", { name: "Exit AR" })).toBeVisible();

  await page.clock.fastForward(10 * 60 * 1000);
  await expect(page.locator("#ar-break-reminder")).toBeVisible();
  await expect(page.locator("#ar-break-reminder")).toHaveText("Take a short break");
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
  await page.goto("https://127.0.0.1:5174#/experiment/chem.atom-builder");

  const enterAr = page.getByRole("button", { name: "Enter AR" });
  await expect(enterAr).toBeVisible();
  await enterAr.click();
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

async function installMockXr(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const windowWithTestCounter = window as Window & { __mmaRafRequests?: number };
    windowWithTestCounter.__mmaRafRequests = 0;
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      windowWithTestCounter.__mmaRafRequests = (windowWithTestCounter.__mmaRafRequests ?? 0) + 1;
      return requestFrame(callback);
    };
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
      readonly frameRate: number;
      readonly inputSources: ArrayLike<unknown> & Iterable<unknown>;
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
    let startupFrameRateFailurePending = location.search.includes("xrstartfail=1");
    const emptyInputSources = { length: 0, *[Symbol.iterator]() {} };
    Object.defineProperty(session, "inputSources", {
      value: emptyInputSources,
    });
    Object.defineProperty(session, "frameRate", {
      get: () => {
        if (startupFrameRateFailurePending) {
          startupFrameRateFailurePending = false;
          throw new Error("Forced XR start failure");
        }
        return 72;
      },
    });
    session.updateRenderState = (state) => {
      session.renderState = { ...session.renderState, ...state };
    };
    let localSpaceRequests = 0;
    session.requestReferenceSpace = async (type) => {
      if (location.search.includes("xrinputfail=1") && type === "local") {
        localSpaceRequests += 1;
        if (localSpaceRequests > 1) {
          throw new Error("Forced XR input initialization failure");
        }
      }
      const space = new EventTarget() as EventTarget & { getOffsetReferenceSpace: () => unknown };
      space.getOffsetReferenceSpace = () => space;
      return space;
    };
    const frame = {
      getViewerPose: () => ({
        transform: {
          matrix: viewerMatrix(),
          position: { x: cameraX, y: cameraY, z: cameraZ },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        views: [{
          eye: "none",
          projectionMatrix: identityMatrix(),
          transform: {
            matrix: viewerMatrix(),
            position: { x: cameraX, y: cameraY, z: cameraZ },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
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
      if (ended) return;
      ended = true;
      session.dispatchEvent(new Event("end"));
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
