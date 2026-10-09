import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("inspect DOM for zoom measurement hooks", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const info = await page.evaluate(() => {
    const markers = [...document.querySelectorAll(".drop-slot-marker")];
    const slotLayer = document.querySelector(".drop-slot-layer");
    return {
      markerCount: markers.length,
      markers: markers.slice(0, 6).map((m) => ({ left: m.style.left, top: m.style.top, hidden: m.hidden })),
      slotLayerHTML: slotLayer?.outerHTML?.slice(0, 300),
      canvasW: document.querySelector("#atom-scene canvas")?.width,
      canvasH: document.querySelector("#atom-scene canvas")?.height,
      sceneHostW: document.querySelector("#atom-scene")?.clientWidth,
    };
  });
  console.log("INFO:", JSON.stringify(info, null, 2));

  // sample some canvas pixels
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector("#atom-scene canvas");
    const off = document.createElement("canvas");
    off.width = canvas.width; off.height = canvas.height;
    const ctx = off.getContext("2d");
    try { ctx.drawImage(canvas, 0, 0); } catch (e) { return "drawImage threw: " + e.message; }
    const w = off.width, h = off.height;
    const row = Math.floor(h / 2);
    const cols = [];
    for (let x = 0; x < w; x += 20) {
      const { data } = ctx.getImageData(x, row, 1, 1);
      cols.push({ x, rgba: Array.from(data) });
    }
    return { w, h, rowSample: cols.slice(0, 10) };
  });
  console.log("SAMPLE:", JSON.stringify(sample, null, 2));
});