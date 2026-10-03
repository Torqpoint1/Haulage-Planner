import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { format } from "date-fns";
import { expectNoOverflow } from "./helpers";
import { planningDays } from "./support/accounts";

/**
 * Stage 7 "Done when": the pick sheet lists items in reverse drop order, and
 * prints cleanly on A4. Uses the Luton 1 load on the second working day
 * (seedPlanning), whatever order earlier specs left its stops in.
 */

test.describe.configure({ mode: "serial" });

const { d1 } = planningDays();
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE d MMM");
};

/** Drop order as the planner sees it in the load panel. */
async function dropOrder(page: Page) {
  await page.goto(`/plan?week=${d1}`);
  const card = page
    .getByRole("region", { name: dayLabel(d1), exact: true })
    .getByRole("article", { name: "Luton 1 load" })
    .first();
  const panel = page.getByRole("dialog", { name: "Luton 1" });
  await expect(async () => {
    await card.getByRole("button").first().click();
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass();
  const stops = panel.getByRole("list", { name: "Stops in drop order" }).locator(":scope > li");
  await expect(stops.first()).toBeVisible();
  const names = await stops.evaluateAll((els) =>
    els.map((el) => el.querySelector("a")?.textContent ?? ""),
  );
  const loadUrl = page.url();
  return { names, loadId: new URL(loadUrl).searchParams.get("load")! };
}

async function openWarehouse(page: Page) {
  await page.goto(`/warehouse?date=${d1}`);
  await page
    .getByRole("navigation", { name: "Loads" })
    .getByRole("button")
    .filter({ hasText: "Luton 1" })
    .click();
  const sheet = page.getByRole("region", { name: "Pick sheet for Luton 1" });
  await expect(sheet).toBeVisible();
  return sheet;
}

let loadId = "";
let dropNames: string[] = [];

test("the pick sheet lists stops in reverse drop order, with handling and securing notes", async ({
  page,
}) => {
  // Other specs running in parallel may change this load's stops, so read both together.
  let sheet = page.locator("never");
  await expect(async () => {
    ({ names: dropNames, loadId } = await dropOrder(page));
    expect(dropNames.length).toBeGreaterThan(1);
    sheet = await openWarehouse(page);
    const sections = sheet.getByRole("list", { name: "Load order" }).locator(":scope > li h3");
    await expect(sections).toHaveText([...dropNames].reverse(), { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(
    sheet.getByRole("list", { name: "Load order" }).locator(":scope > li").first(),
  ).toContainText(`Load first · drop ${dropNames.length} of ${dropNames.length} (last drop)`);
  // Door packs carry their handling notes from the unit settings.
  await expect(sheet.getByRole("list", { name: "Handling" }).first()).toBeVisible();
  await expect(sheet.getByText("Keep upright").first()).toBeVisible();
  await expect(sheet.getByText("Two people to handle").first()).toBeVisible();
});

test.describe("pickers", () => {
  test.use({ storageState: "e2e/.auth/warehouse.json" });

  test("tick lines picked and loaded, and flag shortages with a note", async ({ page }) => {
    const sheet = await openWarehouse(page);
    const firstPicked = sheet.getByRole("button", { name: /^Picked: / }).first();
    const firstLoaded = sheet.getByRole("button", { name: /^Loaded: / }).first();
    await expect(firstPicked).toHaveAttribute("aria-pressed", "false");
    await firstPicked.click();
    await expect(firstPicked).toHaveAttribute("aria-pressed", "true");
    await firstLoaded.click();
    await expect(firstLoaded).toHaveAttribute("aria-pressed", "true");

    await sheet
      .getByRole("button", { name: /^Flag shortage: / })
      .nth(1)
      .click();
    const modal = page.getByRole("dialog", { name: "Flag a shortage" });
    await modal.getByRole("button", { name: "Flag shortage" }).click();
    await expect(modal.getByText("Say what's short")).toBeVisible();
    await modal.getByLabel(/What's short/).fill("1 door frame missing");
    await modal.getByRole("button", { name: "Flag shortage" }).click();
    await expect(sheet.getByText("1 door frame missing")).toBeVisible();

    // It's saved: the progress survives a reload.
    await page.reload();
    const again = await openWarehouse(page);
    await expect(again.getByRole("button", { name: /^Picked: / }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(again.getByText("1 door frame missing")).toBeVisible();
    const card = page
      .getByRole("navigation", { name: "Loads" })
      .getByRole("button")
      .filter({ hasText: "Luton 1" });
    await expect(card.getByRole("meter", { name: "Picked" })).toHaveAttribute("aria-valuenow", "1");
    await expect(card.getByRole("meter", { name: "Loaded" })).toHaveAttribute("aria-valuenow", "1");
    await expect(card).toContainText("1 shortage");

    // Pickers only see the warehouse.
    await page.goto("/plan");
    await expect(
      page.getByRole("heading", { name: "You don't have access to that page" }),
    ).toBeVisible();
  });
});

test("the planner sees picking progress and shortages on the load", async ({ page }) => {
  await page.goto(`/plan?week=${d1}`);
  const card = page
    .getByRole("region", { name: dayLabel(d1), exact: true })
    .getByRole("article", { name: "Luton 1 load" })
    .first();
  await expect(card).toContainText(/Picked 1\/\d+ · Loaded 1\/\d+/);
  await expect(card).toContainText("1 shortage");
  await card.getByRole("button").first().click();
  const panel = page.getByRole("dialog", { name: "Luton 1" });
  await expect(panel.getByRole("list", { name: "Shortages" })).toContainText(
    "1 door frame missing",
  );
  await expect(
    panel.getByRole("navigation", { name: "Print" }).getByRole("link", { name: "Run sheet" }),
  ).toHaveAttribute("href", `/print/loads/${loadId}/run`);
});

test("pick sheet, run sheet and delivery notes print cleanly on A4", async ({ page }) => {
  mkdirSync("screenshots/print", { recursive: true });
  // A4 at 96 dpi is 794 px wide.
  await page.setViewportSize({ width: 794, height: 1123 });
  for (const [sheet, title] of [
    ["pick", "Pick sheet"],
    ["run", "Run sheet"],
    ["delivery", "Delivery notes"],
  ] as const) {
    await page.goto(`/print/loads/${loadId}/${sheet}`);
    const main = page.getByRole("main", { name: title });
    await expect(main.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // No app chrome on a print layout.
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await page.emulateMedia({ media: "print" });
    await expectNoOverflow(page);
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    // Page numbers live in the A4 page margin.
    expect(await page.locator("style").allTextContents()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/size: A4[\s\S]*counter\(page\)[\s\S]*counter\(pages\)/),
      ]),
    );
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(`screenshots/print/${sheet}.pdf`, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    // A4 is 595 × 842 points; every page must be A4.
    const boxes = [
      ...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g),
    ];
    expect(boxes.length).toBeGreaterThan(0);
    for (const [, w, h] of boxes) {
      expect(Math.abs(Number(w) - 595.28)).toBeLessThan(1);
      expect(Math.abs(Number(h) - 841.89)).toBeLessThan(1);
    }
    await page.emulateMedia({ media: "screen" });
  }

  // The printed pick sheet keeps the same load order. Other specs running in parallel
  // may change this load's stops, so read the drop order and the print together.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(async () => {
    const { names } = await dropOrder(page);
    await page.goto(`/print/loads/${loadId}/pick`);
    const printed = page
      .getByRole("main", { name: "Pick sheet" })
      .locator("section h2 span:not(.pos)");
    await expect(printed).toHaveText(
      [...names].reverse().map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`)),
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("can print from the plan but can't open the warehouse to tick", async ({ page }) => {
    await page.goto("/warehouse");
    await expect(
      page.getByRole("heading", { name: "You don't have access to that page" }),
    ).toBeVisible();
    await page.goto(`/print/loads/${loadId}/run`);
    await expect(page.getByRole("heading", { level: 1, name: "Run sheet" })).toBeVisible();
  });
});
