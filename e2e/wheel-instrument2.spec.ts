import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("instrument app wheel handler", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wheelLog = [];
    const origStop = Event.prototype.stopPropagation;
    Event.prototype.stopPropagation = function () {
      if (this.type === "wheel") {
        window.__wheelLog.push({ stopPropagation: true, target: this.target?.tagName + "." + this.target?.className?.toString?.().slice(0,30) });
      }
      return origStop.call(this);
    };
  });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  // Monkey-patch scrollableAncestor by re-defining the wheel listener behaviour.
  // Instead, log scrollHeight/clientHeight of ancestors of the canvas.
  await page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const nodes = [];
    let n = canvas;
    while (n) {
      nodes.push({ tag: n.tagName, cls: n.className?.toString?.().slice(0,30), sh: n.scrollHeight, ch: n.clientHeight, ta: getComputedStyle(n).touchAction, ov: getComputedStyle(n).overflow });
      n = n.parentElement;
    }
    window.__ancestors = nodes;
  });

  await page.locator("#atom-scene canvas").hover();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const log = await page.evaluate(() => window.__wheelLog);
  const anc = await page.evaluate(() => window.__ancestors);
  console.log("ANCESTORS:", JSON.stringify(anc, null, 2));
  console.log("WHEEL LOG:", JSON.stringify(log, null, 2));
  console.log("SCROLL:", scrollBefore, "->", scrollAfter);
});
