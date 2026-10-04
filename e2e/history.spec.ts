import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoOverflow } from "./helpers";
import {
  assetState,
  confirmLoad,
  createAssetLoad,
  createStandingRunCase,
  historyDates,
} from "./support/accounts";

/**
 * Stage 9 "Done when": one search answers "what did we send X in month Y";
 * assets move correctly with loads. Plus standing runs and asset collections.
 */

const monthName = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
const ukDate = (iso: string) => iso.split("-").reverse().join("/");
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test("one search answers “what did we send Hillside Builders last month?”", async ({ page }) => {
  const { lastMonth, monthBefore } = historyDates();
  await page.goto("/history");
  const form = page.getByRole("search", { name: "Search history" });
  await choose(page, form, "Customer", "Hillside Builders");
  await choose(page, form, "Month", monthName(lastMonth));
  await form.getByRole("button", { name: "Search" }).click();

  const results = page.getByRole("region", { name: "Results" });
  await expect(
    results.getByRole("heading", { name: `Sent to Hillside Builders in ${monthName(lastMonth)}` }),
  ).toBeVisible();
  await expect(results.getByRole("status")).toHaveText(
    "1 load · 1 delivery · 1 order · 4 Door pack, 2 Euro pallet",
  );
  // The load, the stop, the confirmation record and the order with its refs.
  await expect(results).toContainText("18t curtainsider");
  await expect(results).toContainText("Dave Hughes");
  await expect(results).toContainText("Hillside Builders · Stroud yard");
  await expect(results).toContainText("Confirmed by Gemma Hill by phone");
  await expect(results).toContainText("HS-501");
  await expect(results).toContainText("PO HB-7781");
  await expect(results).toContainText("DN DN-501");
  // Marlow's delivery on the same load, and Hillside's older one, aren't included.
  await expect(results).not.toContainText("HS-502");
  await expect(results).not.toContainText("HS-503");
  await expectNoOverflow(page);

  // The search is in the address, so it can be shared and survives a reload.
  await page.reload();
  await expect(results.getByRole("status")).toContainText("1 load");

  // A PO number finds the older delivery on its own.
  await form.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("Search past deliveries")).toBeVisible();
  await form.getByLabel("Reference").fill("HB-7650");
  await form.getByRole("button", { name: "Search" }).click();
  await expect(results).toContainText("HS-503");
  await expect(results).toContainText(monthName(monthBefore).replace(" ", " ").split(" ")[0]);
});

test.describe("returnable assets", () => {
  test.describe.configure({ mode: "serial" });

  test("the register lists overdue assets first, and adds and moves them by hand", async ({
    page,
  }) => {
    await page.goto("/history/assets");
    const table = page.getByRole("table", { name: "Assets" });
    await expect(table.getByRole("row").nth(1)).toContainText("ST-20");
    await expect(table.getByRole("row", { name: /ST-201/ })).toContainText("Overdue 12 days");
    await expect(table.getByRole("row", { name: /ST-201/ })).toContainText(
      "Cotswold Kitchens · Cheltenham showroom",
    );

    await page.getByRole("button", { name: "Add assets" }).first().click();
    const add = page.getByRole("dialog", { name: "Add assets" });
    await add.getByLabel(/Asset numbers/).fill("ST-301 to ST-303");
    await add.getByRole("button", { name: "Add assets" }).click();
    await expect(page.getByText("Assets added")).toBeVisible();
    await expect(table.getByRole("row", { name: /ST-302/ })).toContainText("Stroud factory");

    await page.getByRole("button", { name: "Add assets" }).first().click();
    await add.getByLabel(/Asset numbers/).fill("st-301");
    await add.getByRole("button", { name: "Add assets" }).click();
    await expect(add.getByText("Already in use: st-301.")).toBeVisible();
    await add.getByRole("button", { name: "Cancel" }).click();

    await table.getByRole("row", { name: /ST-303/ }).click();
    const panel = page.getByRole("dialog", { name: "ST-303" });
    await choose(page, panel, "Where is it now?", "Lost");
    await panel.getByLabel("Note", { exact: true }).fill("Not seen since the stocktake");
    await panel.getByRole("button", { name: "Save where it is" }).click();
    await expect(page.getByText("ST-303 updated")).toBeVisible();
    await expect(panel.getByRole("definition").first()).toHaveText("Lost");
    const moves = panel.getByRole("list", { name: "Movements" });
    await expect(moves.getByRole("listitem").first()).toContainText("Stroud factory → Lost");
    await expect(moves.getByRole("listitem").first()).toContainText("Not seen since the stocktake");
  });

  test("assets move correctly with a load: out with the delivery, back from a collection", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { loadId, driverId, today } = await createAssetLoad();

    // The planner sends a stillage with the delivery…
    await page.goto(`/plan?week=${today}&weekend=1&load=${loadId}`);
    const panel = page.getByRole("dialog", { name: "7.5t curtainsider" });
    const assets = panel.getByRole("region", { name: "Returnable assets at Cheltenham showroom" });
    await assets.getByRole("button", { name: "Send assets" }).click();
    const send = page.getByRole("dialog", { name: "Send assets" });
    await send.getByRole("checkbox", { name: "ST-101" }).click();
    await send.getByRole("button", { name: "Send (1)" }).click();
    await expect(assets).toContainText("Stillage ST-101");

    // …and the suggestion to collect the overdue ones while there (spec 8.5).
    const collections = panel.getByRole("region", { name: "Asset collections" });
    await expect(collections).toContainText("Stillage ST-201, Stillage ST-202");
    await expect(collections).toContainText("This load already stops at Cheltenham showroom.");
    await collections.getByRole("button", { name: "Collect at this stop" }).click();
    await expect(assets).toContainText("Collect");
    await expect(assets).toContainText("Stillage ST-202");
    await confirmLoad(loadId);

    // The driver drops ST-101 and only finds ST-201 to bring back.
    await page.goto(`/driver?driver=${driverId}`);
    const stop = page.getByRole("article", { name: "Stop 1: Cheltenham showroom" });
    await expect(stop.getByRole("list", { name: "Returnable assets" })).toContainText(
      "Leave: Stillage ST-101",
    );
    await stop.getByRole("button", { name: "Delivered", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Cheltenham showroom" });
    await sheet.getByLabel("Received by").fill("Sam Kitchens");
    const pad = sheet.getByRole("img", { name: /^Signature/ });
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80);
    await page.mouse.move(box.x + 220, box.y + 40);
    await page.mouse.up();
    await sheet.getByRole("checkbox", { name: "Stillage ST-201" }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(stop).toContainText("received by Sam Kitchens", { timeout: 20_000 });

    // ST-101 is at the customer, due back after the stillage's 28 days.
    await expect.poll(async () => (await assetState("ST-101")).status).toBe("at_customer");
    expect((await assetState("ST-101")).expected_return_date).toBe(addDays(today, 28));
    // ST-201 came back with the load (its only stop, so it's complete); ST-202 stayed.
    expect((await assetState("ST-201")).status).toBe("at_depot");
    expect((await assetState("ST-202")).status).toBe("at_customer");

    await page.goto("/history/assets");
    const table = page.getByRole("table", { name: "Assets" });
    await expect(table.getByRole("row", { name: /ST-101/ })).toContainText(
      "Cotswold Kitchens · Cheltenham showroom",
    );
    await expect(table.getByRole("row", { name: /ST-201/ })).toContainText("Stroud factory");
    await table.getByRole("row", { name: /ST-201/ }).click();
    const moves = page
      .getByRole("dialog", { name: "ST-201" })
      .getByRole("list", { name: "Movements" })
      .getByRole("listitem");
    await expect(moves.nth(0)).toContainText(
      `7.5t curtainsider on ${ukDate(today)} → Stroud factory`,
    );
    await expect(moves.nth(1)).toContainText(
      `Cotswold Kitchens · Cheltenham showroom → 7.5t curtainsider on ${ukDate(today)}`,
    );

    // The customer page shows what's at their sites.
    await page.goto("/customers");
    await page.getByRole("link", { name: "Cotswold Kitchens" }).first().click();
    await page.getByRole("tab", { name: "Assets" }).click();
    const list = page.getByRole("list", { name: "Assets at this customer" });
    await expect(list).toContainText("ST-101");
    await expect(list).toContainText("ST-202");
    await expect(list.getByRole("listitem").filter({ hasText: "ST-202" })).toContainText("Overdue");
  });
});

test("a standing run makes a draft load each run day, with its orders suggested onto it", async ({
  page,
}) => {
  await createStandingRunCase();
  await page.goto("/settings/standing-runs");
  await page.getByRole("button", { name: "Add standing run" }).first().click();
  const form = page.getByRole("dialog", { name: "Add standing run" });
  await form.getByRole("button", { name: "Save standing run" }).click();
  await expect(form.getByText("Enter a name for the run.")).toBeVisible();
  await expect(form.getByText("Choose at least one day.")).toBeVisible();
  await expect(form.getByText("Add at least one site.")).toBeVisible();

  await form.getByLabel("Name").fill("Wolds Sunday");
  await form.getByRole("checkbox", { name: "Sunday" }).click();
  await form.getByLabel("Order cut-off").fill("23:59");
  await choose(page, form, "Vehicle", "Luton 1");
  await choose(page, form, "Add a site", /Wolds garden centre/);
  await expect(form.getByRole("list", { name: "Sites in drop order" })).toContainText(
    "Wolds garden centre",
  );
  await form.getByRole("button", { name: "Save standing run" }).click();
  await expect(page.getByText("Standing run saved")).toBeVisible();

  // The plan for the week with the next Sunday has its draft load.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDays(today, (7 - day) % 7);
  await page.goto(`/plan?week=${sunday}&weekend=1`);
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${sunday}T12:00:00Z`))
    .replace(",", "");
  const card = page
    .getByRole("region", { name: label, exact: true })
    .getByRole("article", { name: "Luton 1 load" })
    .filter({ hasText: "Wolds Sunday" });
  await expect(card).toHaveCount(1);
  // Opening the plan again doesn't make another.
  await page.reload();
  await expect(card).toHaveCount(1);

  await card.getByRole("button").first().click();
  const panel = page.getByRole("dialog", { name: "Luton 1" });
  const run = panel.getByRole("region", { name: "Orders for this run" });
  await expect(run).toContainText("SR-601 · Wolds garden centre");
  await expect(run).toContainText("before the 23:59 cut-off");
  await run.getByRole("button", { name: "Add all (1)" }).click();
  await expect(
    panel
      .getByRole("list", { name: "Stops in drop order" })
      .getByRole("link", { name: "Wolds garden centre" }),
  ).toBeVisible();
});
