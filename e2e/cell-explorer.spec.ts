import { expect, test } from "@playwright/test";
import { BASE_URL } from "./fixtures";

/**
 * Plant vs Animal Cell, end to end: the dashboard lists it under Biology, the journey
 * starts from the intro, beats can be skipped, and the first checkpoint explains a wrong
 * tap and accepts a choice made with the chapter controls.
 */

const CELL_URL = `${BASE_URL}/#/experiment/bio.cell-explorer`;

test("the dashboard lists the Cell Explorer under Biology and opens it", async ({ page }) => {
  await page.goto(`${BASE_URL}/#/dashboard`);
  await page.getByRole("link", { name: /Plant vs Animal Cell/ }).click();
  await expect(page).toHaveURL(/#\/experiment\/bio\.cell-explorer$/);
  await expect(page.getByRole("heading", { name: "Plant vs Animal Cell", level: 1 })).toBeVisible();
});

test("the journey starts, skips to the first checkpoint, and pauses", async ({ page }) => {
  await page.goto(CELL_URL);
  await expect(page.locator(".cx-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "Start the journey" }).click();

  const caption = page.locator(".cx-caption");
  await expect(caption).toContainText("CHAPTER 1 OF 4");
  await expect(caption).toContainText("Every living thing is made of cells.");
  await expect(page.getByRole("button", { name: "Chapter 1: Two cells, current" })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(caption).toContainText("(paused)");
  await page.getByRole("button", { name: "Resume" }).click();

  for (let beat = 0; beat < 4; beat += 1) await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator(".cx-ask-prompt")).toHaveText("Tap the plant cell.");
  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.locator(".cx-ask-hint")).toHaveText("Hint: One cell has a thick wall around it.");
});

test("Universe goes back to the dashboard", async ({ page }) => {
  await page.goto(CELL_URL);
  await page.getByRole("button", { name: "Back to all experiments" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
});
