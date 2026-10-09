import { expect, test } from "@playwright/test";

const PHYS = "http://127.0.0.1:5174/#/module/physics.plane-mirror";
const AB = "http://127.0.0.1:5174/#/module/chem.atom-builder";

test("check for CSS leaks from physics module", async ({ page }) => {
  // First load physics module
  await page.goto(PHYS);
  await page.waitForSelector(".plane-mirror-view canvas");
  const physCss = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    const out = [];
    for (const sheet of sheets) {
      try {
        const rules = [...sheet.cssRules].map(r => r.cssText).join("\n");
        if (rules) out.push({ href: sheet.href, rules: rules.slice(0, 500) });
      } catch (e) { out.push({ href: sheet.href, error: "cannot read" }); }
    }
    return out;
  });
  console.log("PHYS CSS:", JSON.stringify(physCss, null, 2).slice(0, 3000));

  // Now navigate to atom builder
  await page.goto(AB);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  const abCss = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    const out = [];
    for (const sheet of sheets) {
      try {
        const rules = [...sheet.cssRules].map(r => r.cssText).join("\n");
        if (rules) out.push({ href: sheet.href, rules: rules.slice(0, 500) });
      } catch (e) { out.push({ href: sheet.href, error: "cannot read" }); }
    }
    return out;
  });
  console.log("AB CSS AFTER PHYSICS:", JSON.stringify(abCss, null, 2).slice(0, 3000));
});
