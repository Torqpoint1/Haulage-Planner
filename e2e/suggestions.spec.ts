import { format } from "date-fns";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { planningDays } from "./support/accounts";

/**
 * Stage 6 "Done when": suggestions explain their reasoning; invalid options
 * appear greyed with the reason; nothing applies without a click. Road
 * distances come from the stand-in routing service (e2e/support/mock-ors.mjs).
 */

test.describe.configure({ mode: "serial" });

const { d0, d1 } = planningDays();
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE d MMM");
};
const day = (page: Page, iso: string) =>
  page.getByRole("region", { name: dayLabel(iso), exact: true });
const loadsOn = (page: Page) =>
  page.getByRole("article", { name: / load$/ }).filter({ hasNot: page.getByText("Suggested") });

async function openBoard(page: Page, iso: string) {
  await page.goto(`/plan?week=${iso}`);
  await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
}

async function openLoad(page: Page, iso: string, title: string) {
  const card = day(page, iso)
    .getByRole("article", { name: `${title} load` })
    .first();
  const panel = page.getByRole("dialog", { name: title });
  await expect(async () => {
    await card.getByRole("button").first().click();
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass();
  return panel;
}

const option = (list: Locator, name: string) =>
  list
    .getByRole("listitem")
    .filter({ has: list.page().getByText(name, { exact: true }) })
    .first();

test("suggested loads explain themselves and change nothing until accepted", async ({ page }) => {
  await openBoard(page, d0);
  await expect(loadsOn(page).first()).toBeVisible();
  const before = await loadsOn(page).count();
  const pool = page.getByRole("list", { name: "Orders to plan" });
  const poolBefore = await pool.getByRole("listitem").count();

  await page.getByRole("button", { name: "Suggest loads" }).click();
  const ghosts = page.getByRole("article", { name: /^Suggested load on / });
  await expect(ghosts.first()).toBeVisible();
  await expect(
    page.getByText(
      /suggested loads?(?: · \d+ orders? not included)?\. Nothing changes until you accept one\./,
    ),
  ).toBeVisible();

  // Each suggestion carries a summary and, on request, its reasoning.
  const first = ghosts.first();
  await expect(first).toContainText(/\d+ drops? · .* · no blocking warnings/);
  await first.getByRole("button", { name: "Why this load?" }).click();
  const why = first.getByRole("list", { name: "Why this load" });
  await expect(why).toContainText(/smallest free vehicle that takes/);
  await expect(why).toContainText(/All due|all can go/);

  // Nothing has been applied: the board and pool are as they were, even after a reload.
  await expect(loadsOn(page)).toHaveCount(before);
  await page.reload();
  await expect(loadsOn(page)).toHaveCount(before);
  await expect(ghosts).toHaveCount(0);
  await expect(pool.getByRole("listitem")).toHaveCount(poolBefore);

  // Orders that couldn't be suggested say why.
  await page.getByRole("button", { name: "Suggest loads" }).click();
  await expect(ghosts.first()).toBeVisible();
  const whyNot = page.getByRole("button", { name: "Why not included?" });
  if (await whyNot.isVisible()) {
    await whyNot.click();
    await expect(
      page.getByRole("list", { name: "Orders not included" }).getByRole("listitem").first(),
    ).toContainText(/SO-|PL-/);
  }

  // Dismiss takes a suggestion away; Accept turns one into a real load. (SO-24103 is
  // kept unplanned for the drop-order test below.)
  const keep = ghosts.filter({ hasText: "SO-24103" });
  if (await keep.count()) {
    const n = await ghosts.count();
    await keep.first().getByRole("button", { name: "Dismiss" }).click();
    await expect(ghosts).toHaveCount(n - 1);
  }
  const accepted = ghosts.first();
  await expect(accepted).toBeVisible();
  const refs = await accepted
    .getByRole("list", { name: "Orders in drop order" })
    .getByRole("listitem")
    .allInnerTexts();
  await accepted.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/^Load created on /)).toBeVisible();
  await expect(loadsOn(page)).toHaveCount(before + 1);
  for (const r of refs) {
    const ref = r.split(/\s+/)[0];
    await expect(pool.getByRole("link", { name: ref, exact: true })).toHaveCount(0);
  }
});

test("delivery options are ranked by cost, with invalid ones greyed and explained", async ({
  page,
}) => {
  await openBoard(page, d0);
  const panel = await openLoad(page, d0, "18t curtainsider");
  const list = panel.getByRole("list", { name: "Delivery options" });
  await expect(list).toBeVisible({ timeout: 15_000 });

  // Valid options come first, cheapest labelled, own-vehicle costs marked as estimates.
  const items = list
    .getByRole("listitem")
    .filter({ has: panel.getByRole("button", { expanded: false }) });
  await expect(list.getByText("Cheapest")).toBeVisible();
  await expect(option(list, "18t curtainsider")).toContainText("Current");
  await expect(option(list, "18t curtainsider")).toContainText(/£[\d,.]+ est\./);
  await expect(option(list, "18t curtainsider")).toContainText("Own vehicle · road distance");

  // The Luton can't take six Euro pallets: greyed, at the bottom, with the reason.
  const luton = option(list, "Luton 1");
  await expect(luton.getByRole("list", { name: "Why Luton 1 can't" })).toContainText(
    "6 EUR on a vehicle that takes 4",
  );
  await expect(luton.getByRole("button", { name: /^Use / })).toHaveCount(0);
  const names = await list.locator(":scope > li").evaluateAll((els) =>
    els.map((el) => ({
      name: el.querySelector("span.truncate")?.textContent,
      invalid: Boolean(el.querySelector("[aria-label^='Why ']")),
    })),
  );
  const firstInvalid = names.findIndex((n) => n.invalid);
  expect(firstInvalid).toBeGreaterThan(0);
  expect(names.slice(firstInvalid).every((n) => n.invalid)).toBe(true);
  void items;

  // Tap for the breakdown.
  await option(list, "Severn Pallet Network").getByRole("button").first().click();
  await expect(option(list, "Severn Pallet Network")).toContainText(
    /6 × full pallet \(Gloucestershire\)/,
  );
  await expect(option(list, "Severn Pallet Network")).toContainText(
    "Waiting over 30 minutes is £35.00 an hour extra.",
  );
});

test("comparing options for a single order explains why some can't do it", async ({ page }) => {
  await openBoard(page, d0);
  await page.getByRole("button", { name: "Add SO-24104 to a load" }).click();
  await page.getByRole("menuitem", { name: "Compare options…" }).click();
  const modal = page.getByRole("dialog", { name: "Options for SO-24104" });
  const list = modal.getByRole("list", { name: "Options for SO-24104" });
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(option(list, "Severn Pallet Network")).toContainText(
    /Door pack \(2,200 mm × 1,000 mm × 1,200 mm, 140 kg\) won't go as a pallet/,
  );
  await expect(option(list, "Severn Pallet Network")).toContainText("Doesn't cover SN");
  await expect(option(list, "Cotswold Haulage")).toContainText(
    "SN1 4DD isn't in any of your postcode zones",
  );
  await expect(option(list, "18t curtainsider")).toContainText(
    "the largest vehicle allowed is a 7.5 tonne",
  );
  await modal.getByRole("button", { name: "Close" }).first().click();
});

test("a suggested drop order only applies when clicked", async ({ page }) => {
  await openBoard(page, d1);
  let panel = await openLoad(page, d1, "Luton 1");
  const stops = () =>
    panel
      .getByRole("list", { name: "Stops in drop order" })
      .getByRole("link", { name: /workshop|Plot|depot/ });
  // Swindon first, then Gloucester, then Newport: going nearest-first is shorter.
  if ((await stops().allInnerTexts())[0] === "Gloucester workshop") {
    await panel.getByRole("button", { name: "Move stop 2 up" }).click();
    await expect(stops().first()).toHaveText("Plot 14, Meadow View");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add SO-24103 to a load" }).click();
  await page.getByRole("menuitem", { name: `${dayLabel(d1)} · Luton 1` }).click();
  await expect(
    page.getByRole("list", { name: "Orders to plan" }).getByRole("link", { name: "SO-24103" }),
  ).toHaveCount(0);
  panel = await openLoad(page, d1, "Luton 1");
  await expect(stops()).toHaveText([
    "Plot 14, Meadow View",
    "Gloucester workshop",
    "Newport depot",
  ]);

  const suggestion = panel.getByRole("region", { name: "Suggested drop order" });
  await expect(suggestion).toBeVisible({ timeout: 15_000 });
  await expect(suggestion).toContainText("Nearest stop each time from Stroud factory");
  await expect(suggestion).toContainText(/Saves about \d+\.\d miles/);
  // Showing it changes nothing.
  await expect(stops()).toHaveText([
    "Plot 14, Meadow View",
    "Gloucester workshop",
    "Newport depot",
  ]);

  await suggestion.getByRole("button", { name: "Use this order" }).click();
  await expect(stops().first()).toHaveText("Gloucester workshop");
  await expect(suggestion).toHaveCount(0);
});

test("road distances come from the routing service, and the map shows orders and routes", async ({
  page,
}) => {
  await openBoard(page, d0);
  const card = day(page, d0).getByRole("article", { name: "Severn Pallet Network load" });
  await expect(card).toContainText(/\d+ miles(?! est)/);
  const panel = await openLoad(page, d0, "Severn Pallet Network");
  await expect(
    panel.getByText(
      "Road distances and HGV driving times; cost is an estimate from your running costs.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Show map" }).click();
  const map = page.getByRole("region", { name: "Orders and loads" });
  await expect(map.getByText("Overdue")).toBeVisible();
  await expect(map.locator("path[class*='map-stroke-']").first()).toBeAttached();
  await page.getByRole("button", { name: "Add SO-24101 to a load" }).click();
  await page.getByRole("menuitem", { name: "Show on map" }).click();
  await expect(map.locator("path.map-pin-selected")).toHaveCount(1);
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("don't get suggestions or the controls that apply them", async ({ page }) => {
    await openBoard(page, d0);
    await expect(page.getByRole("button", { name: "Suggest loads" })).toHaveCount(0);
    const panel = await openLoad(page, d0, "18t curtainsider");
    await expect(panel.getByRole("heading", { name: "Cheapest option" })).toHaveCount(0);
  });
});
