import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("instrument wheel path", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wheelListeners = [];
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      if (type === "wheel") {
        window.__wheelListeners.push({
          tag: this.tagName,
          id: this.id || "",
          cls: this.className?.toString?.().slice(0, 60) || "",
          capture: !!(opts && opts.capture) || opts === true,
          passive: !!(opts && opts.passive),
        });
      }
      return orig.call(this, type, listener, opts);
    };
  });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const listeners = await page.evaluate(() => window.__wheelListeners);
  console.log("WHEEL LISTENERS REGISTERED:", JSON.stringify(listeners, null, 2));

  // Instrument the renderer scale method via the ScreenInputAdapter's applyZoom.
  // We can't access it directly, so hook the canvas style / distance via the
  // render diagnostics text.
  await page.locator("#atom-scene canvas").hover();
  const diagBefore = await page.evaluate(() => document.querySelector(".render-diagnostics")?.textContent);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const diagAfter = await page.evaluate(() => document.querySelector(".render-diagnostics")?.textContent);
  console.log("DIAG before/after wheel:", diagBefore, diagAfter);

  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log("WHEEL scroll:", scrollBefore, "->", scrollAfter);
});
