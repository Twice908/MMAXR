import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./fixtures";

/**
 * Ohm's Law web view, end to end: dashboard entry, placing meters (in the model and
 * from the panel), wrong placements explained, the first mission with its questions,
 * recorded readings in the table and on the V–I graph, and Start over.
 */

const OHM_URL = `${BASE_URL}/#/experiment/phys.ohms-law`;

const status = (page: Page) => page.locator(".ohm-status");
const panelSpot = (page: Page, name: RegExp) => page.locator(".ohm-spot-list").getByRole("button", { name });

async function answer(page: Page, option: RegExp, continueLabel: string): Promise<void> {
  await page.getByRole("button", { name: option }).click();
  await page.getByRole("button", { name: continueLabel, exact: true }).click();
}

async function connectMeters(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Ammeter", exact: true }).click();
  // Place the ammeter by tapping its spot in the model.
  await page.getByRole("button", { name: "Place the ammeter: In the gap (in series)" }).click();
  await expect(status(page)).toContainText("Ammeter placed");
  await page.getByRole("button", { name: "Voltmeter", exact: true }).click();
  await panelSpot(page, /Across the 10 Ω resistor/).click();
  await expect(status(page)).toContainText("Voltmeter placed");
}

test.beforeEach(async ({ page }) => {
  await page.goto(OHM_URL);
  await expect(page.getByRole("heading", { name: "Ohm's Law", level: 1 })).toBeVisible();
  await expect(page.locator(".ohm-scene canvas")).toBeVisible();
});

test("the dashboard lists Ohm's Law under Physics and opens it", async ({ page }) => {
  await page.goto(`${BASE_URL}/#/dashboard`);
  await page.getByRole("link", { name: /Ohm's Law/ }).click();
  await expect(page).toHaveURL(/#\/experiment\/phys\.ohms-law$/);
  await expect(page.getByRole("heading", { name: "Connect the meters" })).toBeVisible();
});

test("wrongly placed meters are rejected with the reason", async ({ page }) => {
  await page.getByRole("button", { name: "Voltmeter", exact: true }).click();
  await panelSpot(page, /In the gap/).click();
  await expect(status(page)).toContainText("The voltmeter is in series");
  await expect(page.locator(".ohm-meters")).toContainText("Not connected");

  await page.getByRole("button", { name: "Ammeter", exact: true }).click();
  await panelSpot(page, /Across the 10 Ω resistor/).click();
  await expect(status(page)).toContainText("The ammeter is in parallel with the resistor");
});

test("connect the meters, close the switch and pass the first mission", async ({ page }) => {
  await connectMeters(page);
  await expect(page.locator(".ohm-meters")).toContainText("0.00 A");
  await page.getByRole("button", { name: "Close the switch" }).click();
  await expect(page.locator(".ohm-meters")).toContainText("0.15 A");
  await expect(page.locator(".ohm-meters")).toContainText("1.50 V");

  await page.getByRole("button", { name: "Check", exact: true }).click();
  await answer(page, /In series with the resistor/, "Next question");
  await answer(page, /measures the potential difference between the two ends/, "Continue");
  await expect(page.getByRole("heading", { name: "Change the potential difference" })).toBeVisible();
});

test("recorded readings fill the table and the V–I graph; Start over clears them", async ({ page }) => {
  await connectMeters(page);
  await page.getByRole("button", { name: "Record reading" }).click();
  await expect(status(page)).toContainText("switch is open");

  await page.getByRole("button", { name: "Close the switch" }).click();
  for (let reading = 1; reading <= 3; reading += 1) {
    await page.getByRole("button", { name: "Record reading" }).click();
    await expect(status(page)).toContainText(`Reading ${reading} recorded`);
    if (reading < 3) await page.getByRole("button", { name: "Add a cell" }).click();
  }
  const rows = page.locator(".mma-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("4.50");
  await expect(rows.nth(2)).toContainText("0.45");
  await expect(rows.nth(2)).toContainText("10.0");
  await expect(page.locator(".mma-graph__legend")).toContainText("10 Ω resistor");

  await page.getByRole("button", { name: "Bulb" }).click();
  await page.getByRole("button", { name: "Record reading" }).click();
  await expect(page.locator(".mma-graph__legend")).toContainText("Bulb");

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".ohm-meters")).toContainText("Not connected");
});

test("narration captions follow the lesson, and sound can be turned on", async ({ page }) => {
  const caption = page.locator(".ohm-caption .narration-caption");
  await expect(caption).toContainText(/Welcome to Ohm's Law|First, connect the meters/);

  await page.getByRole("button", { name: "Tap to enable sound" }).click();
  await expect(page.getByRole("button", { name: "Mute" })).toBeVisible();

  await page.getByRole("button", { name: "Voltmeter", exact: true }).click();
  await panelSpot(page, /In the gap/).click();
  await expect(caption).toContainText("That meter cannot go there");
});
