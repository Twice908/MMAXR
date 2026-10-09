import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("instrument wheel listeners", async ({ page }) => {
  await page.addInitScript(() => {
    window.__registered = [];
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opts) {
      if (type === "wheel" || type === "pointerdown" || type === "pointermove" || type === "touchstart" || type === "touchmove") {
        window.__registered.push({
          type,
          tag: this.tagName,
          id: this.id || "",
          cls: this.className?.toString?.().slice(0, 40) || "",
          capture: !!(opts && opts.capture) || opts === true,
          passive: !!(opts && opts.passive),
        });
      }
      return orig.call(this, type, listener, opts);
    };
  });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const reg = await page.evaluate(() => window.__registered);
  console.log("REGISTERED:", JSON.stringify(reg, null, 2));

  // Now dispatch a wheel event directly on the canvas and see if scale fires.
  const before = await page.evaluate(() => {
    const b = document.querySelector("#atom-scene canvas").getBoundingClientRect();
    const ms = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    let max = 0;
    for (const m of ms) { const d = Math.hypot(parseFloat(m.style.left) - b.width/2, parseFloat(m.style.top) - b.height/2); if (d > max) max = d; }
    return max;
  });

  await page.locator("#atom-scene canvas").hover();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const b = document.querySelector("#atom-scene canvas").getBoundingClientRect();
    const ms = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    let max = 0;
    for (const m of ms) { const d = Math.hypot(parseFloat(m.style.left) - b.width/2, parseFloat(m.style.top) - b.height/2); if (d > max) max = d; }
    return max;
  });
  console.log("WHEEL marker:", before, "->", after);
});
