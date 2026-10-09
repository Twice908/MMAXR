import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("measure layout + wheel handling", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const info = await page.evaluate(() => {
    const style = (el) => el ? getComputedStyle(el) : null;
    const canvas = document.querySelector("#atom-scene canvas");
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      htmlSH: document.documentElement.scrollHeight,
      bodySH: document.body.scrollHeight,
      appSH: document.querySelector("#app")?.scrollHeight,
      appCH: document.querySelector("#app")?.clientHeight,
      atomBuilderSH: document.querySelector(".atom-builder")?.scrollHeight,
      atomBuilderCH: document.querySelector(".atom-builder")?.clientHeight,
      moduleMountSH: document.querySelector(".module-mount")?.scrollHeight,
      modulePageSH: document.querySelector(".module-page")?.scrollHeight,
      canvasBounds: canvas.getBoundingClientRect(),
      sceneViewport: document.querySelector(".scene-viewport")?.getBoundingClientRect(),
    };
  });
  console.log("LAYOUT:", JSON.stringify(info, null, 2));

  // Hook wheel listeners to see what fires
  const wheelEvents = await page.evaluate(() => {
    const targets = [document, document.querySelector("#app"), document.querySelector(".module-mount"), document.querySelector(".atom-builder"), document.querySelector("#atom-scene canvas")];
    const out = [];
    for (const t of targets) {
      if (!t) continue;
      const before = t.getEventListeners ? t.getEventListeners("wheel").length : -1;
      out.push({ target: t.tagName + (t.className ? "." + t.className.split(" ")[0] : ""), listenersBefore: before });
    }
    return out;
  });
  console.log("WHEEL LISTENERS:", JSON.stringify(wheelEvents, null, 2));
});