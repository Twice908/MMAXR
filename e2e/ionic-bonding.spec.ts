import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";

/**
 * Ionic Bonding web view, end to end: dashboard entry, dragging sodium's outer
 * electron onto chlorine inside the 3D model, tap and keyboard alternatives, rule
 * feedback, both missions with their questions, and Start over.
 */

const IONIC_URL = `${BASE_URL}/#/experiment/chem.ionic-bonding`;
const MOVED = "1 electron has moved. Every outer shell is now complete.";

const atomCard = (page: Page, name: RegExp) => page.locator(".ionic-atom").filter({ hasText: name });
const status = (page: Page) => page.locator(".ionic-status");
const electron = (page: Page) => page.locator(".ionic-electron").first();

/** A point inside chlorine's atom in the model: below its label, level with the scene's middle. */
async function chlorinePoint(page: Page): Promise<{ x: number; y: number }> {
  const scene = (await page.locator(".ionic-scene").boundingBox())!;
  const label = (await page.locator(".ionic-label").nth(1).boundingBox())!;
  return { x: label.x + label.width / 2, y: (label.y + label.height + scene.y + scene.height / 2) / 2 };
}

async function centre(page: Page): Promise<{ x: number; y: number }> {
  const box = (await electron(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragElectronToChlorine(page: Page): Promise<void> {
  const from = await centre(page);
  const to = await chlorinePoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
}

async function answer(page: Page, option: RegExp, continueLabel: string): Promise<void> {
  await page.getByRole("button", { name: option }).click();
  await page.getByRole("button", { name: continueLabel, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(IONIC_URL);
  await expect(page.getByRole("heading", { name: "Ionic Bonding", level: 1 })).toBeVisible();
  await expect(page.locator(".ionic-scene canvas")).toBeVisible();
  await expect(electron(page)).toBeVisible();
});

test("the dashboard lists Ionic Bonding under Chemistry and opens it", async ({ page }) => {
  await page.goto(`${BASE_URL}/#/dashboard`);
  await page.getByRole("link", { name: /Ionic Bonding/ }).click();
  await expect(page).toHaveURL(/#\/experiment\/chem\.ionic-bonding$/);
  await expect(page.getByRole("heading", { name: "Move an electron" })).toBeVisible();
});

test("drag sodium's outer electron onto chlorine inside the model", async ({ page }) => {
  await expect(page.locator(".ionic-bench__instruction")).toHaveText(
    "In the model, drag the glowing outer electron from sodium onto chlorine.",
  );
  // The ring sits on sodium (left atom) and shows a hint before the first move.
  const sodiumLabel = (await page.locator(".ionic-label").first().boundingBox())!;
  const ring = await centre(page);
  expect(Math.abs(ring.x - (sodiumLabel.x + sodiumLabel.width / 2))).toBeLessThan(140);
  await expect(electron(page)).toContainText("Drag me");

  await dragElectronToChlorine(page);

  await expect(status(page)).toHaveText(MOVED);
  await expect(atomCard(page, /Sodium/)).toContainText("2,8");
  await expect(atomCard(page, /Sodium/)).toContainText("+1");
  await expect(atomCard(page, /Chlorine/)).toContainText("2,8,8");
  await expect(page.locator(".ionic-label").first()).toContainText("Na+");
  await expect(page.locator(".ionic-electron")).toHaveCount(0);
});

test("tap the electron, then tap chlorine, as a no-drag alternative", async ({ page }) => {
  const ring = await centre(page);
  await page.mouse.click(ring.x, ring.y);
  await expect(page.locator(".ionic-bench__instruction")).toHaveText("Now tap chlorine in the model to give it the electron.");
  await expect(electron(page)).toHaveClass(/is-selected/);
  const to = await chlorinePoint(page);
  await page.mouse.click(to.x, to.y);
  await expect(status(page)).toHaveText(MOVED);
});

test("keyboard users get a move button", async ({ page }) => {
  const move = page.getByRole("button", { name: "Move an outer electron from sodium to chlorine" });
  await move.focus();
  await expect(move).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(MOVED);
});

test("tapping chlorine first is refused with the reason", async ({ page }) => {
  const to = await chlorinePoint(page);
  await page.mouse.click(to.x, to.y);
  await expect(status(page)).toHaveText(
    "Chlorine is a non-metal. It takes electrons to complete its outer shell, so it does not give them away.",
  );
  await expect(atomCard(page, /Chlorine/)).toContainText("2,8,7");
});

test("both missions and all four questions run to the end", async ({ page }) => {
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".mma-lesson .mma-feedback").first()).toContainText("Not yet.");

  await dragElectronToChlorine(page);
  await expect(status(page)).toHaveText(MOVED);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("heading", { name: /What does sodium become/ })).toBeFocused();
  await answer(page, /Na\+, with configuration 2,8$/, "Next question");
  await answer(page, /gaining 1 completes its octet/, "Continue");

  await expect(page.getByRole("heading", { name: "Join the ions" })).toBeVisible();
  await page.getByRole("button", { name: "Join the ions" }).click();
  await expect(status(page)).toHaveText("Ionic bond formed: NaCl.");
  await expect(page.getByRole("button", { name: "Join the ions" })).toBeDisabled();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await answer(page, /attraction between opposite charges/, "Next question");
  await answer(page, /^D\. 0/, "Continue");

  await expect(page.getByRole("heading", { name: "Well done" })).toBeVisible();
  await expect(page.locator(".mma-lesson__body")).toHaveText("2 missions done. 0 hints used. 4 questions correct out of 4.");
});

test("Start over resets the atoms and brings the electron back", async ({ page }) => {
  await dragElectronToChlorine(page);
  await expect(status(page)).toHaveText(MOVED);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(atomCard(page, /Sodium/)).toContainText("2,8,1");
  await expect(atomCard(page, /Chlorine/)).toContainText("2,8,7");
  await expect(electron(page)).toBeVisible();
});
