import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

async function atomBounds(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return { error: "no webgl" };
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let minX = w, maxX = 0, minY = h, maxY = 0, count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
        if (a < 8) continue;
        if (Math.abs(r - 244) < 8 && Math.abs(g - 244) < 8 && Math.abs(b - 238) < 8) continue;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (count === 0) return { count: 0 };
    return { count, width: maxX - minX, height: maxY - minY };
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

test("measure atom size via WebGL readback", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await page.waitForTimeout(500);

  const before = await atomBounds(page);
  console.log("BEFORE:", JSON.stringify(before));

  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 120;

  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 20, y: cy }, { x: cx + 20, y: cy });
  await page.waitForTimeout(300);
  const afterPinchIn = await atomBounds(page);
  console.log("AFTER PINCH IN:", JSON.stringify(afterPinchIn));

  await pinches(page, { x: cx - 20, y: cy }, { x: cx + 20, y: cy }, { x: cx - start, y: cy }, { x: cx + start, y: cy });
  await page.waitForTimeout(300);
  const afterPinchOut = await atomBounds(page);
  console.log("AFTER PINCH OUT:", JSON.stringify(afterPinchOut));

  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
    for (let i = 1; i <= 10; i += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + 120, cy) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await client.detach(); }
  await page.waitForTimeout(300);
  const afterDrag = await atomBounds(page);
  console.log("AFTER DRAG:", JSON.stringify(afterDrag));
});
