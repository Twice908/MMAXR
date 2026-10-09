import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

async function atomBounds(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const b = canvas.getBoundingClientRect();
    const markers = [...document.querySelectorAll(".drop-slot-marker:not([hidden])")];
    if (markers.length === 0) return { count: 0 };
    let max = 0;
    for (const m of markers) {
      const l = parseFloat(m.style.left), t = parseFloat(m.style.top);
      const d = Math.hypot(l - b.width / 2, t - b.height / 2);
      if (d > max) max = d;
    }
    return { count: markers.length, maxDist: max };
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

test("phone pinch and drag behaviour", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text()); });

  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const layout = await page.evaluate(() => ({
    vw: window.innerWidth, vh: window.innerHeight,
    htmlSH: document.documentElement.scrollHeight,
    htmlCH: document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));
  console.log("LAYOUT:", JSON.stringify(layout));

  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 50;

  const before = await atomBounds(page);
  console.log("BEFORE:", JSON.stringify(before));

  // Pinch IN
  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 10, y: cy }, { x: cx + 10, y: cy });
  await page.waitForTimeout(300);
  const afterPinchIn = await atomBounds(page);
  console.log("AFTER PINCH IN:", JSON.stringify(afterPinchIn));

  // Pinch OUT
  await pinches(page, { x: cx - 10, y: cy }, { x: cx + 10, y: cy }, { x: cx - start, y: cy }, { x: cx + start, y: cy });
  await page.waitForTimeout(300);
  const afterPinchOut = await atomBounds(page);
  console.log("AFTER PINCH OUT:", JSON.stringify(afterPinchOut));

  // One-finger drag from top of page
  await page.evaluate(() => window.scrollTo(0, 0));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(cx, cy) });
    for (let i = 1; i <= 10; i += 1) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(cx + 60, cy) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await client.detach(); }
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log("DRAG scroll:", scrollBefore, "->", scrollAfter);

  console.log("ERRORS:", errors);
  await context.close();
});
