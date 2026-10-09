import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("scroll behaviour", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  // Scroll down to the bottom and check if the canvas stays in viewport.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  console.log("canvas at bottom:", JSON.stringify(canvas));
  console.log("scrollY:", await page.evaluate(() => window.scrollY));
  console.log("htmlSH:", await page.evaluate(() => document.documentElement.scrollHeight));
});
