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

test("desktop 1280x720 gestures", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text()); });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 120;

  // Pinch IN (fingers together) => zoom IN => spread decreases
  const before = await markerSpread(page);
  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 20, y: cy }, { x: cx + 20, y: cy });
  await page.waitForTimeout(200);
  const afterPinchIn = await markerSpread(page);
  console.log("PINCH IN: spread", before, "->", afterPinchIn, "(expect decrease)");

  // Pinch OUT (fingers apart) => zoom OUT => spread increases
  await pinches(page, { x: cx - 20, y: cy }, { x: cx + 20, y: cy }, { x: cx - start, y: cy }, { x: cx + start, y: cy });
  await page.waitForTimeout(200);
  const afterPinchOut = await markerSpread(page);
  console.log("PINCH OUT: spread", afterPinchIn, "->", afterPinchOut, "(expect increase)");

  // Wheel up (negative deltaY) => zoom IN => spread decreases
  await page.locator("#atom-scene canvas").hover();
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const spreadAfterWheel = await markerSpread(page);
  const scrollAfterWheel = await page.evaluate(() => window.scrollY);
  console.log("WHEEL UP: spread", afterPinchOut, "->", spreadAfterWheel, "(expect decrease) | scroll", scrollBeforeWheel, "->", scrollAfterWheel, "(expect 0)");

  // Wheel down (positive deltaY) => zoom OUT => spread increases
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const spreadAfterWheelDown = await markerSpread(page);
  const scrollAfterWheelDown = await page.evaluate(() => window.scrollY);
  console.log("WHEEL DOWN: spread", spreadAfterWheel, "->", spreadAfterWheelDown, "(expect increase) | scroll", scrollAfterWheel, "->", scrollAfterWheelDown, "(expect 0)");

  // One-finger drag => rotate, no scroll
  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
    for (let i = 1; i <= 10; i += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + 120, cy) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await client.detach(); }
  await page.waitForTimeout(100);
  const scrollAfterDrag = await page.evaluate(() => window.scrollY);
  console.log("DRAG: scroll", scrollBeforeDrag, "->", scrollAfterDrag, "(expect 0)");

  console.log("ERRORS:", errors);
  await context.close();
});