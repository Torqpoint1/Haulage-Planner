import { expect, test } from "@playwright/test";
import { SCREENS, WIDTHS, expectNoOverflow } from "./helpers";

test("root redirects to Today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
});

test.describe("desktop sidebar", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows all seven tabs in order and navigates", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    const links = nav.getByRole("link").filter({ visible: true });
    await expect(links).toHaveText(SCREENS.map((s) => s.title));
    for (const screen of SCREENS) {
      await links.filter({ hasText: screen.title }).click();
      await expect(page).toHaveURL(new RegExp(`${screen.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: screen.title })).toBeVisible();
      await expect(links.filter({ hasText: screen.title })).toHaveAttribute("aria-current", "page");
    }
  });
});

test.describe("tablet rail", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("shows icon links with accessible names", async ({ page }) => {
    await page.goto("/orders");
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    for (const screen of SCREENS) {
      await expect(
        nav.getByRole("link", { name: screen.title }).filter({ visible: true }),
      ).toBeVisible();
    }
    await nav.getByRole("link", { name: "Warehouse" }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Warehouse" })).toBeVisible();
  });
});

test.describe("phone bottom bar", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("reaches every tab, with the rest under More", async ({ page }) => {
    await page.goto("/today");
    const bar = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    for (const title of ["Today", "Plan", "Orders", "Customers"]) {
      await expect(bar.getByRole("link", { name: title })).toBeVisible();
    }
    for (const title of ["Warehouse", "History", "Settings"]) {
      await bar.getByRole("button", { name: "More" }).click();
      await bar.getByRole("link", { name: title }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(bar.getByRole("button", { name: "More" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });
});

test("theme and density can be changed from the account menu and persist", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/today");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page
    .getByRole("button", { name: /Account and display settings/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page
    .getByRole("button", { name: /Account and display settings/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Compact" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
});

test("keyboard users can skip to content and see focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/today");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

for (const { name, width, height } of WIDTHS) {
  test(`no overflow on any screen at ${name} width`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoOverflow(page);
    }
  });
}

test("unknown pages show a helpful 404", async ({ page }) => {
  await page.goto("/nope");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Today" })).toBeVisible();
});
