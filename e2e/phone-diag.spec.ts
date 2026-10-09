import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

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

/** Measure the on-screen extent of rendered atom pixels (non-background). */
async function atomPixelExtent(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector("#atom-scene canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("2d");
    // Read back via 2d fallback: draw the canvas to an offscreen 2d canvas and sample.
    const off = document.createElement("canvas");
    off.width = canvas.width; off.height = canvas.height;
    const ctx = off.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, off.width, off.height);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // background is #f4f4ee => (244,244,238); skip near-background
      if (Math.abs(r - 244) < 6 && Math.abs(g - 244) < 6 && Math.abs(b - 238) < 6) continue;
      const x = (i / 4) % off.width;
      const y = Math.floor((i / 4) / off.width);
      if (data[i + 3] < 10) continue;
      if (r === 0 && g === 0 && b === 0) continue; // clear color black? alpha 1 => skip
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { count, width: maxX - minX, height: maxY - minY, minX, maxX, minY, maxY };
  });
}

test("phone-sized pinch and drag behaviour", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text()); });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const info = await page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const style = (el) => el ? getComputedStyle(el) : null;
    return {
      canvasTouchAction: style(canvas)?.touchAction,
      sceneHostTouchAction: style(document.querySelector("#atom-scene"))?.touchAction,
      viewportTouchAction: style(document.querySelector(".scene-viewport"))?.touchAction,
      htmlScrollHeight: document.documentElement.scrollHeight,
      htmlClientHeight: document.documentElement.clientHeight,
    };
  });
  console.log("INFO:", JSON.stringify(info, null, 2));

  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 60;

  const before = await atomPixelExtent(page);
  console.log("BEFORE:", JSON.stringify(before));

  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 10, y: cy }, { x: cx + 10, y: cy });
  await page.waitForTimeout(200);
  const afterZoomIn = await atomPixelExtent(page);
  console.log("AFTER ZOOM IN:", JSON.stringify(afterZoomIn));

  await pinches(page, { x: cx - 10, y: cy }, { x: cx + 10, y: cy }, { x: cx - start, y: cy }, { x: cx + start, y: cy });
  await page.waitForTimeout(200);
  const afterZoomOut = await atomPixelExtent(page);
  console.log("AFTER ZOOM OUT:", JSON.stringify(afterZoomOut));

  const scrollBefore = await page.evaluate(() => window.scrollY);
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
    for (let i = 1; i <= 10; i += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + 80, cy) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await client.detach(); }
  await page.waitForTimeout(100);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log("DRAG scrollBefore/After:", scrollBefore, scrollAfter);

  console.log("ERRORS:", errors);
  await context.close();
});