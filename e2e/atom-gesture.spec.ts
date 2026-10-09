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

/** Max distance of any visible drop-slot marker from the canvas centre. */
async function markerSpread(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const b = canvas.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
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

test("pinch zooms the atom in screen mode (direct load)", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 60;
  const before = await markerSpread(page);
  expect(before).not.toBeNull();
  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 10, y: cy }, { x: cx + 10, y: cy });
  await page.waitForTimeout(200);
  const after = await markerSpread(page);
  console.log("direct: before", before, "after", after);
  expect(after).not.toBeNull();
  expect(after).toBeGreaterThan(before! + 2);
});

test("pinch zooms the atom after navigating from the physics module", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/#/module/physics.plane-mirror");
  await page.waitForSelector(".plane-mirror-view canvas");
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const canvas = await page.locator("#atom-scene canvas").boundingBox();
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  const start = 60;
  const before = await markerSpread(page);
  expect(before).not.toBeNull();
  await pinches(page, { x: cx - start, y: cy }, { x: cx + start, y: cy }, { x: cx - 10, y: cy }, { x: cx + 10, y: cy });
  await page.waitForTimeout(200);
  const after = await markerSpread(page);
  console.log("after-physics: before", before, "after", after);
  expect(after).not.toBeNull();
  expect(after).toBeGreaterThan(before! + 2);
});

test("wheel zooms the atom in screen mode", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const canvas = await page.locator("#atom-scene canvas");
  await canvas.hover();
  const before = await markerSpread(page);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const after = await markerSpread(page);
  console.log("wheel: before", before, "after", after);
  expect(after).not.toBeNull();
  expect(after).toBeGreaterThan(before! + 2);
});

test("one-finger touch drag rotates the atom without scrolling the page", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(MODULE_URL);
    await expect(page.locator("#atom-scene canvas")).toBeVisible();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const canvas = await page.locator("#atom-scene canvas").boundingBox();
    const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
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
    console.log("drag scroll:", scrollBefore, scrollAfter);
    expect(scrollAfter).toEqual(scrollBefore);
  } finally {
    await context.close();
  }
});