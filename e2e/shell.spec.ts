import { expect, test } from "@playwright/test";

test("lazy-loads Atom Builder and mounts the screen canvas", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
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

test("mounts and emits telemetry when crypto.randomUUID is unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("http://127.0.0.1:5174");
  await expect(page.getByRole("heading", { name: "Build carbon-12" })).toBeVisible();
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.locator("#dev-event-panel")).toContainText("mission_started");
  expect(pageErrors).toEqual([]);
});

test("waits for a gesture before playing bundled mock narration", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  const enableSound = page.getByRole("button", { name: "Tap to enable sound" });
  await expect(enableSound).toBeVisible();

  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await expect(eventPanel).toBeVisible();
  await expect(eventPanel).not.toContainText("narration_played");
  await enableSound.click();
  await expect(eventPanel).toContainText("narration_played");
});

test("loads the opt-in audible mock assets in development", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/?narrationAudio=audible-test");
  const eventPanel = page.locator("#dev-event-panel");
  await page.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(eventPanel).toContainText("narration_played");
  await expect(eventPanel).not.toContainText("voice_fallback_used");
});

test("shows a sound-blocked hint when AudioContext stays suspended after a tap", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await page.addInitScript(() => {
    AudioContext.prototype.resume = async function (): Promise<void> {};
    Object.defineProperty(AudioContext.prototype, "state", {
      configurable: true,
      get: () => "suspended",
    });
  });
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.locator("#narration-audio-status")).toHaveText("Sound blocked. Tap to try again.");
  await expect(page.getByRole("button", { name: "Tap to enable sound" })).toBeVisible();
  expect(warnings).toContain(
    "Narration sound is blocked: AudioContext remains suspended after the user gesture.",
  );
});

test("restores narration preferences after reload but still requires a sound gesture", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
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
  await page.goto("http://127.0.0.1:5174");
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
  await expect(page.locator("#narration-caption")).toContainText("Now make Na plus");
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
  await page.goto("http://127.0.0.1:5174");
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
  await page.goto("http://127.0.0.1:5174");
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