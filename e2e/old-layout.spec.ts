import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("layout after forcing atom builder to fill viewport", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  // Force the atom builder to be exactly viewport height and check if wheel zoom works.
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      html, body, #app, .app-shell, .module-page, .module-mount, .atom-builder {
        height: 100% !important;
        max-height: 100% !important;
        overflow: hidden !important;
      }
      .atom-builder { min-height: 0 !important; }
      .builder-content { min-height: 0 !important; }
    `;
    document.head.append(style);
  });
  await page.evaluate(() => window.scrollTo(0, 0));

  const info = await page.evaluate(() => ({
    htmlSH: document.documentElement.scrollHeight,
    htmlCH: document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));
  console.log("LAYOUT AFTER FIX:", JSON.stringify(info));

  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;

  const markerBefore = await page.evaluate(() => {
    const b = document.querySelector("#atom-scene canvas").getBoundingClientRect();
    const ms = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    let max = 0;
    for (const m of ms) { const d = Math.hypot(parseFloat(m.style.left) - b.width/2, parseFloat(m.style.top) - b.height/2); if (d > max) max = d; }
    return max;
  });

  await page.locator("#atom-scene canvas").hover();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const markerAfter = await page.evaluate(() => {
    const b = document.querySelector("#atom-scene canvas").getBoundingClientRect();
    const ms = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    let max = 0;
    for (const m of ms) { const d = Math.hypot(parseFloat(m.style.left) - b.width/2, parseFloat(m.style.top) - b.height/2); if (d > max) max = d; }
    return max;
  });
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log("WHEEL: marker", markerBefore, "->", markerAfter, "| scroll", scrollAfter);
});
