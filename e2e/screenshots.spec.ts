import { expect, test, type Page } from "@playwright/test";
import { SCREENS, THEMES, WIDTHS, expectNoOverflow, setPreferences } from "./helpers";

const SETTINGS_SCREENS = [
  ["/settings", "Settings"],
  ["/settings/organisation", "Organisation & branding"],
  ["/settings/depots", "Depots"],
  ["/settings/unit-types", "Handling unit types"],
  ["/settings/vehicles", "Vehicles"],
  ["/settings/drivers", "Drivers"],
  ["/settings/hauliers", "Hauliers & rate cards"],
  ["/settings/zones", "Postcode zones"],
  ["/settings/thresholds", "Warning thresholds"],
] as const;

/**
 * Quality gate (spec 10.10): screenshots of every screen at 375, 768 and
 * 1280 widths in light and dark mode, written to ./screenshots for review.
 */

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
}

for (const theme of THEMES) {
  for (const { name, width, height } of WIDTHS) {
    test.describe(`${theme} ${name}`, () => {
      test.use({ viewport: { width, height } });

      test.beforeEach(async ({ page }) => {
        await setPreferences(page, theme);
      });

      for (const screen of SCREENS) {
        test(`${screen.title}`, async ({ page }) => {
          await page.goto(screen.path);
          await expect(page.getByRole("heading", { level: 1, name: screen.title })).toBeVisible();
          await settle(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/${screen.path.slice(1)}.png`,
            fullPage: true,
          });
        });
      }

      test("component gallery", async ({ page }) => {
        test.setTimeout(60_000);
        await page.goto("/dev/components");
        await page.locator("#map-panel").scrollIntoViewIfNeeded();
        await expect(page.locator("#map-panel path.map-pin").first()).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/gallery.png`,
          fullPage: true,
        });
        // One image per component section too, which is easier to review.
        const sections = page.locator("main section[aria-labelledby]");
        for (const id of await sections.evaluateAll((els) => els.map((e) => e.id))) {
          await page
            .locator(`#${id}`)
            .screenshot({ path: `screenshots/${theme}/${width}/gallery/${id}.png` });
        }
      });

      test("settings screens", async ({ page }) => {
        test.setTimeout(90_000);
        for (const [path, heading] of SETTINGS_SCREENS) {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
          await settle(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/settings-${path.split("/").pop()}.png`,
            fullPage: true,
          });
        }
        await page.goto("/settings/hauliers");
        await page.getByRole("link", { name: "Severn Pallet Network" }).first().click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Severn Pallet Network" }),
        ).toBeVisible();
        await settle(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/settings-haulier.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Edit 2026 tariff" }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-rate-card-panel.png` });
        await page.keyboard.press("Escape");

        await page.goto("/settings/vehicles");
        await page.getByRole("button", { name: "Edit Luton 1" }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-vehicle-panel.png` });
      });

      test("customer screens", async ({ page }) => {
        test.setTimeout(90_000);
        const shot = async (name: string) => {
          await settle(page);
          await expectNoOverflow(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/${name}.png`,
            fullPage: true,
          });
        };
        await page.goto("/customers");
        await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
        await shot("customers-list");

        await page.getByRole("link", { name: "Severn Timber Merchants" }).first().click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Severn Timber Merchants" }),
        ).toBeVisible();
        await shot("customer");
        await page.getByRole("tab", { name: /Contacts/ }).click();
        await shot("customer-contacts");

        await page.getByRole("tab", { name: /Sites/ }).click();
        await page.getByRole("link", { name: "Newport depot" }).first().click();
        await expect(page.getByRole("heading", { level: 1, name: "Newport depot" })).toBeVisible();
        await shot("site");
        await page.getByRole("button", { name: "Edit site" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-site-panel.png` });
        await page.keyboard.press("Escape");

        await page.goto("/customers");
        await page.getByRole("link", { name: "Oakfield Homes" }).first().click();
        await page.getByRole("link", { name: "Plot 14, Meadow View" }).first().click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Plot 14, Meadow View" }),
        ).toBeVisible();
        await shot("site-restricted");
      });

      test("users and roles", async ({ page }) => {
        await page.goto("/settings/users");
        await expect(page.getByRole("heading", { level: 1, name: "Users & roles" })).toBeVisible();
        await settle(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/settings-users.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Invite someone" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-invite-modal.png` });
      });

      test.describe("signed out", () => {
        test.use({ storageState: { cookies: [], origins: [] } });
        for (const [name, path, heading] of [
          ["sign-in", "/sign-in", "Sign in"],
          ["sign-up", "/sign-up", "Create an account"],
          ["invite-not-found", `/invite/${"0".repeat(64)}`, "Invitation not found"],
        ] as const) {
          test(name, async ({ page }) => {
            await setPreferences(page, theme);
            await page.goto(path);
            await expect(page.getByRole("heading", { name: heading })).toBeVisible();
            await settle(page);
            await page.screenshot({
              path: `screenshots/${theme}/${width}/${name}.png`,
              fullPage: true,
            });
          });
        }
      });

      test.describe("other roles", () => {
        test.use({ storageState: "e2e/.auth/driver.json" });
        test("driver run and no-access", async ({ page }) => {
          await setPreferences(page, theme);
          await page.goto("/driver");
          await expect(page.getByRole("heading", { level: 1, name: "My run" })).toBeVisible();
          await settle(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/driver.png`,
            fullPage: true,
          });
          await page.goto("/settings");
          await expect(
            page.getByRole("heading", { name: "You don't have access to that page" }),
          ).toBeVisible();
          await page.screenshot({
            path: `screenshots/${theme}/${width}/no-access.png`,
            fullPage: true,
          });
        });
      });

      test("open states", async ({ page }) => {
        await page.goto("/dev/components");
        await settle(page);

        await page.getByRole("button", { name: "Open load panel" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-side-panel.png` });
        await page.keyboard.press("Escape");

        await page.locator("#combobox").getByRole("combobox").nth(1).click();
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-combobox.png` });
        await page.keyboard.press("Escape");

        await page
          .locator("#date-picker")
          .getByRole("button", { name: "Choose date from calendar" })
          .nth(1)
          .click();
        await expect(page.getByRole("grid")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-date-picker.png` });
        await page.keyboard.press("Escape");

        await page
          .locator("#warning-item")
          .getByRole("button", { name: "Override…" })
          .first()
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-override-modal.png` });
        await page.keyboard.press("Escape");

        if (name === "phone") {
          await page.goto("/today");
          await page.getByRole("button", { name: "More" }).click();
          await page.screenshot({ path: `screenshots/${theme}/${width}/state-more-menu.png` });
        }
      });
    });
  }
}
