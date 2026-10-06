import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the @mma/engine-input screen adapters as they run in
 * the real browser. Every gesture here is a trusted input event dispatched by
 * Chromium, travelling through ScreenInputAdapter -> InputManager ->
 * MouseInputAdapter / TouchInputAdapter -> the module's action reducer. The
 * assertions read observable DOM state, so they fail if the action vocabulary,
 * the tray-aware picking, or the drop reducer regresses.
 */

const APP_URL = "http://127.0.0.1:5174/#/module/chem.atom-builder";
const CAMERA_FOV = 42;
const SCENE_SCALE = 14;

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByRole("heading", { name: "Atom Builder" })).toBeVisible();
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
});

test("mouse drag from the tray places a proton in the nucleus", async ({ page }) => {
  await expect(page.locator("#proton-count")).toHaveText("1");

  const from = await centerOf(page.locator('[data-particle="proton"]'));
  const to = await nucleusPoint(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("#proton-count")).toHaveText("2");
  await expect(page.locator("#atomic-number")).toHaveText("2");
  await expect(page.locator("#element-symbol")).toHaveText("He");
});

test("mouse drag from the tray snaps an electron onto the next shell", async ({ page }) => {
  await page.getByRole("button", { name: "Add electron", exact: true }).click();
  await expect(page.locator("#electron-configuration")).toHaveText("2");

  const from = await centerOf(page.locator('[data-particle="electron"]'));
  const to = await shellPoint(page, 1.51, 12);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("#electron-count")).toHaveText("3");
  await expect(page.locator("#electron-configuration")).toHaveText("2,1");
});

test("the drag label follows the pointer and clears on drop", async ({ page }) => {
  const ghost = page.locator("#drag-ghost");
  const from = await centerOf(page.locator('[data-particle="neutron"]'));
  const to = await nucleusPoint(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });

  await expect(ghost).toHaveClass(/is-visible/);
  await expect(ghost).toHaveText("neutron");
  const midDrag = await ghost.boundingBox();
  expect(midDrag).not.toBeNull();
  expect(midDrag!.y + midDrag!.height).toBeLessThanOrEqual(to.y);

  await page.mouse.up();

  await expect(ghost).not.toHaveClass(/is-visible/);
  await expect(page.locator("#neutron-count")).toHaveText("1");
});

test("a drag released outside the nucleus drops nothing", async ({ page }) => {
  const ghost = page.locator("#drag-ghost");
  const from = await centerOf(page.locator('[data-particle="proton"]'));
  const to = await shellPoint(page, 2.4);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  await expect(ghost).not.toHaveClass(/is-visible/);
  await expect(page.locator("#proton-count")).toHaveText("1");
  await expect(page.locator("#atomic-number")).toHaveText("1");
});

test("an invalid placement is rejected without changing the atom", async ({ page }) => {
  const from = await centerOf(page.locator('[data-particle="proton"]'));
  const to = await shellPoint(page, 1.51);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("#proton-count")).toHaveText("1");
  await expect(page.locator("#chemistry-feedback")).toHaveText(
    "Protons and neutrons belong in the nucleus, not on an electron shell.",
  );
});

test("hovering the tray does not start a drag until the button is pressed", async ({ page }) => {
  const ghost = page.locator("#drag-ghost");
  const from = await centerOf(page.locator('[data-particle="electron"]'));

  await page.mouse.move(from.x, from.y);
  await page.mouse.move(from.x + 24, from.y + 24, { steps: 4 });

  await expect(ghost).not.toHaveClass(/is-visible/);
  await expect(page.locator("#electron-count")).toHaveText("1");
});

test("touch drag from the tray places a neutron in the nucleus", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
  });
  const touchPage = await context.newPage();
  try {
    await touchPage.goto(APP_URL);
    await expect(touchPage.getByRole("heading", { name: "Atom Builder" })).toBeVisible();

    const from = await centerOf(touchPage.locator('[data-particle="neutron"]'));
    const to = await nucleusPoint(touchPage);

    await dragWithTouch(touchPage, from, to);

    await expect(touchPage.locator("#neutron-count")).toHaveText("1");
    await expect(touchPage.locator("#mass-number")).toHaveText("2");
    await expect(touchPage.locator("#drag-ghost")).not.toHaveClass(/is-visible/);
  } finally {
    await context.close();
  }
});

test("stepper buttons dispatch commands through the same action reducer", async ({ page }) => {
  await page.getByRole("button", { name: "Add proton", exact: true }).click();
  await expect(page.locator("#proton-count")).toHaveText("2");

  await page.getByRole("button", { name: "Remove proton", exact: true }).click();
  await expect(page.locator("#proton-count")).toHaveText("1");

  await page.getByRole("button", { name: "Add electron", exact: true }).click();
  await expect(page.locator("#electron-count")).toHaveText("2");

  await page.getByRole("button", { name: "Reset atom", exact: true }).click();
  await expect(page.locator("#proton-count")).toHaveText("1");
  await expect(page.locator("#electron-count")).toHaveText("1");
});

test("no pointer gesture leaves uncaught page errors behind", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const from = await centerOf(page.locator('[data-particle="electron"]'));
  const to = await shellPoint(page, 1.51);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.move(to.x + 200, to.y + 120, { steps: 10 });
  await page.mouse.up();

  expect(pageErrors).toEqual([]);
});

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const bounds = await locator.boundingBox();
  if (!bounds) {
    throw new Error("Expected a visible bounding box");
  }
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Viewport point at the nucleus, derived from the scene camera projection. */
async function nucleusPoint(page: Page): Promise<{ x: number; y: number }> {
  return scenePoint(page, 0);
}

/**
 * Viewport point at `radius` scene units right of the nucleus. `nudgePx` biases
 * the point into the ring-zone snap tolerance, which ring picking needs but
 * raycast picking does not.
 */
async function shellPoint(page: Page, radius: number, nudgePx = 0): Promise<{ x: number; y: number }> {
  return scenePoint(page, radius, nudgePx);
}

async function scenePoint(page: Page, radius: number, nudgePx = 0): Promise<{ x: number; y: number }> {
  const bounds = await page.locator("#atom-scene canvas").boundingBox();
  if (!bounds) {
    throw new Error("Expected the scene canvas to be visible");
  }
  const pixelsPerUnit = bounds.height / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * SCENE_SCALE);
  return {
    x: bounds.x + bounds.width / 2 + radius * pixelsPerUnit + nudgePx,
    y: bounds.y + bounds.height / 2,
  };
}

/**
 * Drive a real trusted touch drag through CDP. Playwright's touchscreen helper
 * only taps, and synthetic pointer events would make setPointerCapture throw,
 * so the gesture is dispatched at the browser input layer instead.
 */
async function dragWithTouch(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12 }];
  const steps = 10;
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const x = from.x + (to.x - from.x) * ratio;
      const y = from.y + (to.y - from.y) * ratio;
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x, y) });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}