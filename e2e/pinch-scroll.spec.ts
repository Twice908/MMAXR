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

async function pinches(page, fromA, fromB, toA, toB, steps = 10) {
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(fromA.x, fromA.y).concat(point(fromB.x, fromB.y)) });
    for (let i = 1; i <= steps; i += 1) {
      const r = i / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(fromA.x + (toA.x - fromA.x) * r, fromA.y + (toA.y - fromA.y) * r)
          .concat(point(fromB.x + (toB.x - fromB.x) * r, fromB.y + (toB.y - fromB.y) * r)),
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}

test("pinch scroll behaviour", async ({ browser }) => {
  for (const [label, w, h] of [["desktop", 1280, 720], ["phone", 390, 844]]) {
    const context = await browser.newContext({ hasTouch: true, viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto(MODULE_URL);
    await expect(page.locator("#atom-scene canvas")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = await page.locator("#atom-scene canvas").boundingBox();
    const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
    const start = 120;

    const scroll0 = await page.evaluate(() => window.scrollY);
    const spread0 = await markerSpread(page);
    await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 20, y: cy }, { x: cx + 20, y: cy });
    await page.waitForTimeout(200);
    const spread1 = await markerSpread(page);
    const scroll1 = await page.evaluate(() => window.scrollY);

    await page.evaluate(() => window.scrollTo(0, 0));
    await pinches(page, { x: cx - 20, y: cy }, { x: cx + 20, y: cy }, { x: cx - start, y: cy }, { x: cx + start, y: cy });
    await page.waitForTimeout(200);
    const spread2 = await markerSpread(page);
    const scroll2 = await page.evaluate(() => window.scrollY);

    console.log(`[${label}] scroll0=${scroll0} spread0=${spread0} | pinchIn: spread1=${spread1} scroll1=${scroll1} | pinchOut: spread2=${spread2} scroll2=${scroll2}`);
    await context.close();
  }
});