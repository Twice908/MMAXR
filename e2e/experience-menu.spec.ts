import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __experienceMenuStreams: MediaStream[];
  }
}

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("experience menu exposes catalogue routes and closes with keyboard or outside tap", async ({ page }) => {
  await page.goto(MODULE_URL);
  const button = page.getByRole("button", { name: "Menu" });
  const panel = page.getByRole("navigation", { name: "Experience navigation" });

  await expect(button).toBeVisible();
  await expect(page.locator(".experience-menu-label")).toBeVisible();
  await expect(panel).toBeHidden();
  await button.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link")).toHaveText([
    "Start", "Chemistry", "Physics", "Biology", "Atom Builder",
  ]);
  await expect(panel.getByRole("link", { name: "Atom Builder" })).toHaveAttribute("aria-current", "page");
  await expect(panel.getByRole("link", { name: "Start" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.locator(".scene-heading").click();
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
});

test("experience menu hides in AR and becomes icon-only in camera view", async ({ page }) => {
  await page.goto(MODULE_URL);
  const wrapper = page.locator(".experience-menu");
  const label = page.locator(".experience-menu-label");
  await page.locator(".module-mount").evaluate((element) => element.classList.add("ar-active"));
  await expect(wrapper).toBeHidden();
  await page.locator(".module-mount").evaluate((element) => element.classList.remove("ar-active"));
  await expect(wrapper).toBeVisible();

  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await expect(label).toBeHidden();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exit camera view" })).toBeVisible();
});

test("navigating away from an active camera session stops tracks without errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(window, "__experienceMenuStreams", { value: [] });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const stream = await originalGetUserMedia(constraints);
        window.__experienceMenuStreams.push(stream);
        return stream;
      },
    });
  });
  await page.goto(MODULE_URL);
  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Experience navigation" })
    .getByRole("link", { name: "Start" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.__experienceMenuStreams[0]?.getTracks().map((track) => track.readyState),
  )).toEqual(["ended"]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("changing to a module route unmounts the prior instance and stops its camera tracks", async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(window, "__experienceMenuStreams", { value: [] });
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const stream = await originalGetUserMedia(constraints);
        window.__experienceMenuStreams.push(stream);
        return stream;
      },
    });
  });
  await page.goto("http://127.0.0.1:5174/?module=chem.atom-builder");
  await page.getByRole("button", { name: "Camera view" }).click();
  await page.getByRole("dialog", { name: "Start camera view?" })
    .getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".camera-view-video")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Experience navigation" })
    .getByRole("link", { name: "Atom Builder" }).click();
  await expect(page).toHaveURL(/#\/module\/chem\.atom-builder$/);
  await expect(page.locator(".camera-view-video")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.__experienceMenuStreams[0]?.getTracks().map((track) => track.readyState),
  )).toEqual(["ended"]);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
});

test("canvas drag still places a particle while the menu is closed", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator(".experience-menu-panel")).toBeHidden();
  await expect(page.locator("#proton-count")).toHaveText("1");
  const tray = await page.locator('[data-particle="proton"]').boundingBox();
  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  if (!tray || !canvas) {
    throw new Error("The particle tray or scene canvas is missing.");
  }
  await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("#proton-count")).toHaveText("2");
});
