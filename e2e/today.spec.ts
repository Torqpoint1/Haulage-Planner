import { expect, test } from "@playwright/test";
import { expectNoOverflow } from "./helpers";
import { historyDates } from "./support/accounts";

/**
 * Stage 10 "Done when": Today shows all attention items with working links;
 * report figures match the underlying data.
 */

const monthName = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

test("Today lists what needs attention, blocking first, and each link opens the fix", async ({
  page,
}) => {
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  const glance = page.getByRole("definition");
  await expect(glance.first()).toBeVisible();

  const blocking = page.getByRole("region", { name: "Blocking" });
  const checks = page.getByRole("region", { name: "Checks" });
  await expect(blocking).toBeVisible();
  await expect(checks).toBeVisible();
  // Blocking warnings come before checks.
  const [b, c] = await Promise.all([blocking.boundingBox(), checks.boundingBox()]);
  expect(b!.y).toBeLessThan(c!.y);
  await expectNoOverflow(page);

  // Every blocking item links to its load on the plan with that warning in view.
  const items = blocking.getByRole("link", { name: /^Fix: / });
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  const first = items.first();
  const title = (await first.getAttribute("aria-label"))!.replace(/^Fix: /, "");
  const href = (await first.getAttribute("href"))!;
  expect(href).toMatch(/^\/plan\?week=\d{4}-\d{2}-\d{2}&weekend=1&load=[0-9a-f-]+&warning=/);
  await first.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  const highlighted = panel
    .getByRole("list", { name: "Warnings" })
    .locator("li[aria-current='true']");
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText(title);
  await expect(highlighted.getByRole("button").first()).toBeVisible();

  // The other links all resolve to a highlighted warning too.
  await page.goto("/today");
  const hrefs = await page
    .getByRole("link", { name: /^Fix: / })
    .evaluateAll((els) => els.map((e) => [e.getAttribute("href"), e.getAttribute("aria-label")]));
  for (const [link, label] of hrefs.slice(0, 6)) {
    await page.goto(link!);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("list", { name: "Warnings" })
        .locator("li[aria-current='true']"),
    ).toContainText(label!.replace(/^Fix: /, ""));
  }
});

test("Today shows today's loads, orders due soon and overdue assets", async ({ page }) => {
  await page.goto("/today");
  const loads = page.getByRole("list", { name: "Today's loads" });
  await expect(loads).toContainText("Luton 1");
  await expect(
    page.getByRole("list", { name: "Orders due soon" }).getByRole("link").first(),
  ).toBeVisible();
  await page.getByRole("link", { name: /returnable assets? overdue back from customers/ }).click();
  await expect(page).toHaveURL(/\/history\/assets\?status=overdue/);
  await expect(page.getByRole("table", { name: "Assets" })).toContainText("Overdue");
});

test("report figures match the underlying data", async ({ page }) => {
  const { lastMonth } = historyDates();
  await page.goto(`/history/reports?month=${lastMonth.slice(0, 7)}`);
  await expect(page.getByRole("heading", { level: 2, name: monthName(lastMonth) })).toBeVisible();

  // Seeded last month: the 18t (2 drops), Cotswold Haulage (2 drops, £180 agreed, one
  // failed: no access) and Severn Pallet Network (1 drop, rate card, failed: site closed).
  const glance = page
    .getByRole("region", { name: "Period at a glance" })
    .or(page.locator("dl[aria-label='Period at a glance']"));
  await expect(glance).toContainText("Completed loads3");
  await expect(glance).toContainText("Failed deliveries2 (40%)");

  const cost = page.getByRole("table", { name: "Cost per drop" });
  const cotswold = cost.getByRole("row", { name: /Cotswold Haulage/ });
  await expect(cotswold.getByRole("cell")).toHaveText([
    "Cotswold HaulageHaulier",
    "1",
    "2",
    "£180.00",
    "£90.00",
  ]);
  await expect(
    cost
      .getByRole("row", { name: /18t curtainsider/ })
      .getByRole("cell")
      .nth(2),
  ).toHaveText("2");
  await expect(
    cost
      .getByRole("row", { name: /All loads/ })
      .getByRole("cell")
      .nth(2),
  ).toHaveText("5");

  const failed = page.getByRole("table", { name: "Failed deliveries by reason" });
  await expect(failed.getByRole("row")).toHaveText([
    "ReasonFailed drops",
    "Couldn't get access1",
    "Site closed1",
  ]);
  await expect(page.getByRole("list", { name: "Failed drops" })).toContainText("HS-505");

  const spend = page.getByRole("table", { name: "Haulier spend by month" });
  await expect(spend.getByRole("row", { name: /Cotswold Haulage/ }).getByRole("cell")).toHaveText([
    monthName(lastMonth),
    "Cotswold Haulage",
    "1",
    "£180.00",
    "£0.00",
    "£180.00",
  ]);
  await expect(spend.getByRole("row", { name: /Severn Pallet Network/ })).toContainText("est.");

  const fill = page.getByRole("table", { name: "Vehicle fill" });
  await expect(fill.getByRole("row", { name: /18t curtainsider/ })).toContainText("%");
  await expectNoOverflow(page);
});
