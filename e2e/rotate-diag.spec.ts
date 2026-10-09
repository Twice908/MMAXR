import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

async function markerPositions(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const b = canvas.getBoundingClientRect();
    const markers = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    return markers.map((m) => ({
      x: parseFloat(m.style.left) - b.width / 2,
      y: parseFloat(m.style.top) - b.height / 2,
    }));
  });
}

test("one-finger drag rotates the atom", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  try {
    await page.goto(MODULE_URL);
    await expect(page.locator("#atom-scene canvas")).toBeVisible();

    const before = await markerPositions(page);
    const canvas = await page.locator("#atom-scene canvas").boundingBox();
    const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;

    const client = await page.context().newCDPSession(page);
    const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
    try {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
      for (let i = 1; i <= 10; i += 1) {
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + 120, cy) });
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally { await client.detach(); }
    await page.waitForTimeout(200);
    const after = await markerPositions(page);

    console.log("BEFORE:", JSON.stringify(before));
    console.log("AFTER:", JSON.stringify(after));
    // Rotation should shift marker x positions.
    const moved = JSON.stringify(before) !== JSON.stringify(after);
    console.log("ROTATED:", moved);
    expect(moved).toBe(true);
  } finally {
    await context.close();
  }
});