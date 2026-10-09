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

test("wheel zoom works when the page is not scrollable", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  // Pinch out first to give room.
  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx - 120, cy).concat(point(cx + 120, cy)) });
    for (let i = 1; i <= 10; i += 1) {
      const r = i / 10;
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx - 120 + (-100) * r, cy).concat(point(cx + 120 + (100) * r, cy)) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await client.detach(); }
  await page.waitForTimeout(200);
  const spreadZoomedOut = await markerSpread(page);
  console.log("spread after pinch-out:", spreadZoomedOut);

  // Now kill page scrolling and try wheel zoom-in.
  await page.evaluate(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.querySelector(".atom-builder")!.style.overflow = "hidden";
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.locator("#atom-scene canvas").hover();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const spreadAfterWheel = await markerSpread(page);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log("WITH overflow:hidden: spread", spreadZoomedOut, "->", spreadAfterWheel, "| scroll", scrollBefore, "->", scrollAfter);
  expect(spreadAfterWheel).toBeLessThan(spreadZoomedOut!);
  expect(scrollAfter).toEqual(0);
});