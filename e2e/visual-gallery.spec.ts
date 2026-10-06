import { expect, test } from "@playwright/test";

test("visual gallery mounts and draws at desktop and phone sizes", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("http://127.0.0.1:5174/?visual-gallery");
    const canvas = page.getByTestId("visual-gallery-canvas");
    await expect(canvas).toBeVisible();
    const single = page.getByRole("button", { name: "a Single mirror" });
    const paired = page.getByRole("button", { name: "b Two mirrors" });
    const apparatus = page.getByRole("button", { name: "c Apparatus" });
    const stage = page.getByRole("button", { name: "d Stage" });
    await expect(single).toHaveAttribute("aria-pressed", "true");
    await expect(paired).toBeVisible();
    await expect(apparatus).toBeVisible();
    await expect(stage).toBeVisible();
    const labels = page.getByRole("button", { name: "Labels: On" });
    await expect(labels).toHaveAttribute("aria-pressed", "true");
    await labels.click();
    await expect(page.getByRole("button", { name: "Labels: Off" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Labels: Off" }).click();
    await paired.click();
    await expect(paired).toHaveAttribute("aria-pressed", "true");
    await stage.click();
    const stageMode = page.getByRole("button", { name: "Use transparent stage" });
    await expect(stageMode).toBeVisible();
    await stageMode.click();
    await expect(page.getByRole("button", { name: "Use opaque stage" })).toBeVisible();
    await expect
      .poll(async () =>
        canvas.evaluate((element) => {
          const source = element as HTMLCanvasElement;
          if (source.width === 0 || source.height === 0) {
            return 0;
          }
          const sample = document.createElement("canvas");
          sample.width = 64;
          sample.height = 64;
          const context = sample.getContext("2d");
          if (!context) {
            return 0;
          }
          context.drawImage(source, 0, 0, sample.width, sample.height);
          const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
          const colors = new Set<string>();
          for (let index = 0; index < pixels.length; index += 4) {
            colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
          }
          return colors.size;
        }),
      )
      .toBeGreaterThan(2);
  }
});
