import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

async function markerSpread(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const b = canvas.getBoundingClientRect();
    const markers = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    if (markers.length === 0) return null;
    let max = 0;
    for (const m of markers) {
      const l = parseFloat(m.style.left), t = parseFloat(m.style.top);
      const d = Math.hypot(l - b.width / 2, t - b.height / 2);
      if (d > max) max = d;
    }
    return max;
  });
}

test("wheel over canvas: zoom or page-scroll?", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const before = await markerSpread(page);
  const scrollBefore = await page.evaluate(() => window.scrollY);

  const canvas = await page.locator("#atom-scene canvas");
  await canvas.hover();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const after = await markerSpread(page);
  const scrollAfter = await page.evaluate(() => window.scrollY);

  console.log("WHEEL DOWN: spread before/after", before, after, "| scroll before/after", scrollBefore, scrollAfter);
  expect(after).not.toBeNull();
  expect(after).toBeGreaterThan(before! + 2);
  expect(scrollAfter).toEqual(scrollBefore);
});