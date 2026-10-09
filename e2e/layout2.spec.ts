import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("layout comparison", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const info = await page.evaluate(() => {
    const style = (el) => el ? getComputedStyle(el) : null;
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      htmlSH: document.documentElement.scrollHeight,
      htmlCH: document.documentElement.clientHeight,
      bodySH: document.body.scrollHeight,
      app: { sh: document.querySelector("#app")?.scrollHeight, ch: document.querySelector("#app")?.clientHeight, style: style(document.querySelector("#app")) },
      appShell: { sh: document.querySelector(".app-shell")?.scrollHeight, ch: document.querySelector(".app-shell")?.clientHeight },
      modulePage: { sh: document.querySelector(".module-page")?.scrollHeight, ch: document.querySelector(".module-page")?.clientHeight, ov: style(document.querySelector(".module-page"))?.overflow, h: style(document.querySelector(".module-page"))?.height },
      moduleMount: { sh: document.querySelector(".module-mount")?.scrollHeight, ch: document.querySelector(".module-mount")?.clientHeight, ov: style(document.querySelector(".module-mount"))?.overflow, h: style(document.querySelector(".module-mount"))?.height },
      atomBuilder: { sh: document.querySelector(".atom-builder")?.scrollHeight, ch: document.querySelector(".atom-builder")?.clientHeight, ov: style(document.querySelector(".atom-builder"))?.overflow, minH: style(document.querySelector(".atom-builder"))?.minHeight },
      builderContent: { sh: document.querySelector(".builder-content")?.scrollHeight, ch: document.querySelector(".builder-content")?.clientHeight },
      atomWorkspace: { sh: document.querySelector(".atom-workspace")?.scrollHeight, ch: document.querySelector(".atom-workspace")?.clientHeight },
      sceneViewport: r(document.querySelector(".scene-viewport")),
      scrollY: window.scrollY,
    };
  });
  console.log("LAYOUT2:", JSON.stringify(info, null, 2));
});
