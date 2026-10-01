import { expect, test } from "@playwright/test";
import { WIDTHS, expectNoOverflow, setPreferences } from "./helpers";

const SECTIONS = [
  "Foundations",
  "Accent colour",
  "Button",
  "Input",
  "Select",
  "Combobox",
  "Date picker",
  "Checkbox",
  "Toggle",
  "Chip / Badge",
  "Card",
  "Table",
  "Side panel",
  "Modal",
  "Tabs",
  "Toast",
  "Empty state",
  "Skeleton loader",
  "Capacity bar",
  "Warning item",
  "Map panel",
  "Avatar",
  "Tooltip",
];

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await setPreferences(page, "light");
  await page.goto("/dev/components");
});

test("shows every component from spec 10.4", async ({ page }) => {
  for (const name of SECTIONS) {
    await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  }
});

test("theme switch applies dark mode", async ({ page }) => {
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("select and combobox choose values by keyboard and search", async ({ page }) => {
  const section = page.locator("#combobox");
  await section.getByRole("combobox").first().click();
  await page.getByPlaceholder("Search…").fill("brecon");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(section.getByRole("combobox").first()).toHaveText(/Brecon Doors/);

  const select = page.locator("#select").getByRole("combobox").first();
  await select.click();
  await page.getByRole("option", { name: "18t curtainsider" }).click();
  await expect(select).toHaveText("18t curtainsider");
});

test("date picker accepts typed UK dates and flags invalid ones", async ({ page }) => {
  const input = page.locator("#date-picker").getByLabel("With value");
  await input.fill("5/10/26");
  await input.press("Enter");
  await expect(input).toHaveValue("05/10/2026");
  await expect(page.getByText("Selected 05/10/2026")).toBeVisible();

  await input.fill("31/02/2026");
  await input.press("Tab");
  await expect(input).toHaveAttribute("aria-invalid", "true");
});

test("date picker calendar is keyboard operable", async ({ page }) => {
  const field = page.locator("#date-picker");
  await field.getByRole("button", { name: "Choose date from calendar" }).nth(1).click();
  const grid = page.getByRole("grid");
  await expect(grid.getByRole("gridcell", { name: "Thursday 1 October 2026" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(field.getByLabel("With value")).toHaveValue("02/10/2026");
});

test("table sorts and hides columns", async ({ page }) => {
  const table = page.getByRole("table", { name: "Orders", exact: true });
  const firstRef = table.locator("tbody tr").first().locator("td").first();
  await expect(firstRef).toHaveText("ORD-10423"); // sorted by required date
  await table.getByRole("button", { name: "Weight" }).click();
  await expect(firstRef).toHaveText("ORD-10423"); // 95 kg is lightest
  await table.getByRole("button", { name: "Weight" }).click();
  await expect(firstRef).toHaveText("ORD-10424"); // heaviest first
  await expect(table.getByRole("columnheader", { name: "Weight" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  await page.locator("#table").getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Postcode" }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: "Postcode" })).toHaveCount(0);
});

test("side panel and modal open, trap focus and close with Escape", async ({ page }) => {
  await page.getByRole("button", { name: "Open load panel" }).click();
  const panel = page.getByRole("dialog", { name: /Load 3/ });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.getByRole("dialog", { name: "Cancel order ORD-10424?" });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("blocking warning override requires a reason and stays visible", async ({ page }) => {
  const section = page.locator("#warning-item");
  await section.getByRole("button", { name: "Override…" }).first().click();
  const modal = page.getByRole("dialog", { name: "Override blocking warning" });
  await modal.getByRole("button", { name: "Override and log" }).click();
  await expect(modal.getByRole("alert")).toContainText("Write a short reason");
  await modal.getByLabel(/Reason/).fill("Customer will unload by hand with two staff");
  await modal.getByRole("button", { name: "Override and log" }).click();
  await expect(modal).toBeHidden();
  await expect(section.getByText("Overridden by Demo Planner:")).toHaveCount(1);
  await expect(section.getByText("Doors must travel upright")).toBeVisible();
});

test("check warnings can be dismissed", async ({ page }) => {
  const section = page.locator("#warning-item");
  await section.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(section.getByText("Two people needed to handball")).toHaveCount(0);
});

test("capacity bars report state in words, not just colour", async ({ page }) => {
  const section = page.locator("#capacity-bar");
  await expect(section.getByText("Near limit ·")).toBeVisible();
  await expect(section.getByText("2 over ·")).toBeVisible();
  await expect(section.getByRole("meter").first()).toHaveAttribute(
    "aria-valuetext",
    /8 of 16 pallet spaces/,
  );
});

test("toasts appear with their message", async ({ page }) => {
  await page.locator("#toast").getByRole("button", { name: "Success" }).click();
  await expect(page.getByText("Load confirmed")).toBeVisible();
});

test("map panel renders pins and falls back without a tile provider", async ({ page }) => {
  const section = page.locator("#map-panel");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator("path.map-pin").first()).toBeVisible();
  await expect(section.locator("path.map-pin")).toHaveCount(6);
  await expect(section.getByText("Map background unavailable").first()).toBeVisible();
  await section.getByRole("button", { name: "Brecon Doors & Windows" }).click();
  await expect(section.locator("path.map-pin-selected")).toHaveCount(1);
});

for (const { name, width, height } of WIDTHS) {
  test(`gallery has no overflow at ${name} width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Component gallery" })).toBeVisible();
    await expectNoOverflow(page);
  });
}
