import { expect, test } from "@playwright/test";

const MODULE_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("measure atom builder internal height", async ({ page }) => {
  await page.goto(MODULE_URL);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();

  const info = await page.evaluate(() => {
    const measure = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel, sh: el.scrollHeight, ch: el.clientHeight, h: cs.height, minH: cs.minHeight, top: r.top, bottom: r.bottom };
    };
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      vh: window.innerHeight,
      html: measure("html"),
      body: measure("body"),
      app: measure("#app"),
      appShell: measure(".app-shell"),
      modulePage: measure(".module-page"),
      moduleMount: measure(".module-mount"),
      atomBuilder: measure(".atom-builder"),
      builderHeader: measure(".builder-header"),
      builderContent: measure(".builder-content"),
      atomWorkspace: measure(".atom-workspace"),
      sceneViewport: measure(".scene-viewport"),
      lessonPanel: measure(".lesson-panel"),
      narrationHud: measure(".narration-hud"),
      assessmentCard: measure(".assessment-card"),
      rail: measure(".rail"),
      railMain: measure(".rail-main"),
      railFooter: measure(".rail-footer"),
      scrollY: window.scrollY,
    };
  });
  console.log("HEIGHT DIAG:", JSON.stringify(info, null, 2));
});
