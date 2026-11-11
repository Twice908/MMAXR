import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, TEST_ACCESS_CODE, TEST_USERNAME } from "./fixtures";

// These tests start signed out, unlike the lesson tests (see playwright.config.ts).
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, username = TEST_USERNAME, code = TEST_ACCESS_CODE): Promise<void> {
  await page.getByLabel("Your name").fill(username);
  await page.getByLabel("Access code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signed-out visitors see only the login page, even for a direct experiment link", async ({ page }) => {
  await page.goto(`${BASE_URL}/#/experiment/chem.atom-builder`);
  await expect(page.getByRole("heading", { name: "Science experiments" })).toBeVisible();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator(".atom-builder")).toHaveCount(0);

  await page.goto(`${BASE_URL}/#/dashboard`);
  await expect(page).toHaveURL(/#\/login$/);
});

test("a wrong code is explained and keeps the student on the login page", async ({ page }) => {
  await page.goto(BASE_URL);
  await signIn(page, TEST_USERNAME, "WRONG-CODE");
  await expect(page.getByRole("alert")).toContainText("access code is not right");
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByLabel("Access code")).toHaveValue("");
});

test("a too-short name is rejected before the code is checked", async ({ page }) => {
  await page.goto(BASE_URL);
  await signIn(page, "A");
  await expect(page.getByRole("alert")).toContainText("at least 2");
});

test("five wrong codes lock the form for a while", async ({ page }) => {
  await page.goto(BASE_URL);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await signIn(page, TEST_USERNAME, `WRONG-${attempt}`);
    await expect(page.getByRole("alert")).toContainText("access code is not right");
  }
  await signIn(page, TEST_USERNAME, TEST_ACCESS_CODE);
  await expect(page.getByRole("alert")).toContainText("Too many tries");
  await expect(page).toHaveURL(/#\/login$/);
});

test("login, dashboard, open the experiment, go back, rename and sign out", async ({ page }) => {
  await page.goto(BASE_URL);
  await signIn(page);

  // Dashboard: three subjects (star systems), each experiment a planet link.
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.getByRole("heading", { name: `Hi, ${TEST_USERNAME}` })).toBeVisible();
  await expect(page.getByLabel("Your details")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Physics", "Chemistry", "Biology"]);
  await expect(page.locator("section[data-subject='physics']")).toContainText("Ohm's Law");
  await expect(page.locator("section[data-subject='biology']")).toContainText("Coming soon");
  await expect(page.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "true");
  const atomCard = page.locator("section[data-subject='chemistry'] [data-experiment='chem.atom-builder']");
  await expect(atomCard).toContainText("Atom Builder");
  await expect(atomCard).toContainText("Draft");

  // The session survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: `Hi, ${TEST_USERNAME}` })).toBeVisible();

  // Open the experiment, then return with the in-page button.
  await atomCard.getByRole("link", { name: "Open Atom Builder" }).click();
  await expect(page).toHaveURL(/#\/experiment\/chem\.atom-builder$/);
  await expect(page.locator("#atom-scene canvas")).toBeVisible();
  await page.getByRole("button", { name: "Back to all experiments" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(page.locator(".atom-builder")).toHaveCount(0);

  // Browser back and forward move between the same two pages.
  await page.goBack();
  await expect(page.locator(".atom-builder")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: `Hi, ${TEST_USERNAME}` })).toBeVisible();

  // Settings: rename.
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Display name").fill("New Name");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved.");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Hi, New Name" })).toBeVisible();

  // Sign out ends the session; the dashboard is no longer reachable.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await page.goto(`${BASE_URL}/#/dashboard`);
  await expect(page).toHaveURL(/#\/login$/);
});

test("a typed name is shown as text, never as markup", async ({ page }) => {
  await page.goto(BASE_URL);
  await signIn(page, "<b>Bold</b>");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, <b>Bold</b>");
  await expect(page.locator("h1 b")).toHaveCount(0);
});

test("an unknown experiment id returns to the dashboard", async ({ page }) => {
  await page.goto(BASE_URL);
  await signIn(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto(`${BASE_URL}/#/experiment/bio.nothing-here`);
  await expect(page).toHaveURL(/#\/dashboard$/);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test("the top bar options live in a hamburger menu", async ({ page }) => {
    await page.goto(BASE_URL);
    await signIn(page);
    await expect(page.getByRole("heading", { name: `Hi, ${TEST_USERNAME}` })).toBeVisible();

    const menu = page.getByRole("button", { name: "Menu" });
    const settings = page.getByRole("button", { name: "Settings" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(settings).toBeHidden();
    await expect(signOut).toBeHidden();
    // The bar itself fits the screen width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(settings).toBeVisible();
    await expect(signOut).toBeVisible();
    await expect(page.locator(".topbar-actions .user-name")).toHaveText(TEST_USERNAME);

    // Escape and an outside tap close it.
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await menu.click();
    await page.getByRole("heading", { name: "Chemistry" }).click();
    await expect(settings).toBeHidden();

    // Settings opens from the menu and closes the menu.
    await menu.click();
    await settings.click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(settings).toBeHidden();

    // Sign out from the menu.
    await menu.click();
    await signOut.click();
    await expect(page).toHaveURL(/#\/login$/);
  });
});
