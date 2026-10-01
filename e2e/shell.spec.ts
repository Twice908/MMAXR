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