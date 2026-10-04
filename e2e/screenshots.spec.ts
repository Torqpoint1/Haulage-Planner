import { expect, test, type Page } from "@playwright/test";
import { SCREENS, THEMES, WIDTHS, expectNoOverflow, setPreferences } from "./helpers";
import { planningDays } from "./support/accounts";

const SETTINGS_SCREENS = [
  ["/settings", "Settings"],
  ["/settings/organisation", "Organisation & branding"],
  ["/settings/depots", "Depots"],
  ["/settings/unit-types", "Handling unit types"],
  ["/settings/vehicles", "Vehicles"],
  ["/settings/drivers", "Drivers"],
  ["/settings/hauliers", "Hauliers & rate cards"],
  ["/settings/zones", "Postcode zones"],
  ["/settings/standing-runs", "Standing runs"],
  ["/settings/thresholds", "Warning thresholds"],
  ["/settings/compliance-zones", "Compliance zones"],
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

      test("order screens", async ({ page }) => {
        test.setTimeout(90_000);
        const shot = async (name: string) => {
          await settle(page);
          await expectNoOverflow(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/${name}.png`,
            fullPage: true,
          });
        };
        await page.goto("/orders?q=SO-241");
        await expect(page.getByRole("link", { name: "SO-24102" }).first()).toBeVisible();
        await shot("orders-list");
        await page.goto("/orders?q=no-such-order");
        await expect(page.getByRole("heading", { name: "No orders match" })).toBeVisible();
        await shot("orders-empty");

        await page.goto("/orders?q=SO-24102");
        await page.getByRole("link", { name: "SO-24102" }).first().click();
        await expect(page.getByRole("heading", { level: 1, name: "SO-24102" })).toBeVisible();
        await shot("order");
        await page.getByRole("button", { name: "Update readiness" }).click();
        await shot("order-readiness");

        await page.getByRole("link", { name: "Edit order" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Edit SO-24102" })).toBeVisible();
        await shot("order-edit");

        await page.goto("/orders/new");
        await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
        await page.getByRole("button", { name: "Create order" }).click();
        await expect(page.getByText("Choose the customer.")).toBeVisible();
        await shot("order-new-errors");

        await page.goto("/orders/import");
        await expect(page.getByRole("heading", { level: 1, name: "Import orders" })).toBeVisible();
        await shot("orders-import");
        const csv = [
          "Order No,Account,Delivery Postcode,Required date,Unit,Qty",
          "SHOT-1,HB001,GL5 3QF,01/12/2030,EUR,2",
          "SHOT-2,Nobody Ltd,GL5 3QF,01/12/2030,EUR,2",
          "SHOT-3,MJ014,GL1 2BB,31/02/2030,XYZ,0",
        ].join("\n");
        await page.getByLabel("Choose a CSV file").setInputFiles({
          name: "orders-from-sage.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(csv),
        });
        await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible();
        await shot("orders-import-map");
        await page.getByRole("button", { name: /^Check/ }).click();
        await expect(page.getByText("Problem rows", { exact: true })).toBeVisible();
        await shot("orders-import-check");
      });

      test("plan screens", async ({ page }) => {
        test.setTimeout(90_000);
        const { d1 } = planningDays();
        const shot = async (name: string, fullPage = true) => {
          await settle(page);
          await expectNoOverflow(page);
          await page.screenshot({ path: `screenshots/${theme}/${width}/${name}.png`, fullPage });
        };
        await page.goto(`/plan?week=${d1}`);
        await expect(page.getByRole("article", { name: "Luton 1 load" }).first()).toBeVisible();
        await shot("plan-week");

        await page.goto(`/plan?week=${d1}&view=day&day=${d1}`);
        await expect(page.getByRole("article", { name: "Luton 1 load" }).first()).toBeVisible();
        await shot("plan-day");

        const card = page.getByRole("article", { name: "Luton 1 load" }).first();
        const panel = page.getByRole("dialog", { name: "Luton 1" });
        await expect(async () => {
          await card.getByRole("button").first().click();
          await expect(panel).toBeVisible({ timeout: 2_000 });
        }).toPass();
        await settle(page);
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-load-panel.png` });
        await panel.getByRole("button", { name: "Booking and confirmation" }).first().click();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-stop-form.png` });
        await page.keyboard.press("Escape");

        await page.goto(`/plan?week=${d1}`);
        await page
          .getByRole("button", { name: /^New load on/ })
          .first()
          .click();
        await expect(page.getByRole("dialog", { name: "New load" })).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-new-load.png` });
        await page.keyboard.press("Escape");
      });

      test("suggestion screens", async ({ page }) => {
        test.setTimeout(120_000);
        const { d0 } = planningDays();
        const shot = async (name: string) => {
          await settle(page);
          await expectNoOverflow(page);
          await page.screenshot({
            path: `screenshots/${theme}/${width}/${name}.png`,
            fullPage: true,
          });
        };
        await page.goto(`/plan?week=${d0}`);
        await page.getByRole("button", { name: "Suggest loads" }).click();
        await expect(page.getByText(/Nothing changes until you accept one\./)).toBeVisible({
          timeout: 15_000,
        });
        const ghost = page.getByRole("article", { name: /^Suggested load on / }).first();
        if (await ghost.isVisible())
          await ghost.getByRole("button", { name: "Why this load?" }).click();
        await shot("plan-suggestions");

        await page.getByRole("button", { name: "Show map" }).click();
        await expect(page.getByRole("region", { name: "Orders and loads" })).toBeVisible();
        await shot("plan-map");

        const card = page.getByRole("article", { name: "18t curtainsider load" }).first();
        const panel = page.getByRole("dialog", { name: "18t curtainsider" });
        await expect(async () => {
          await card.getByRole("button").first().click();
          await expect(panel).toBeVisible({ timeout: 2_000 });
        }).toPass();
        const options = panel.getByRole("list", { name: "Delivery options" });
        await expect(options).toBeVisible({ timeout: 15_000 });
        await options.getByRole("button").first().click();
        await options.scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-load-options.png` });
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: /^Add SO-24104 to a load$/ }).click();
        await page.getByRole("menuitem", { name: "Compare options…" }).click();
        const modal = page.getByRole("dialog", { name: "Options for SO-24104" });
        await expect(modal.getByRole("list", { name: "Options for SO-24104" })).toBeVisible({
          timeout: 15_000,
        });
        await settle(page);
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-compare-options.png` });
      });

      test("warehouse screens", async ({ page }) => {
        test.setTimeout(90_000);
        const { d1 } = planningDays();
        await page.goto(`/warehouse?date=${d1}`);
        await page
          .getByRole("navigation", { name: "Loads" })
          .getByRole("button")
          .filter({ hasText: "Luton 1" })
          .click();
        await expect(page.getByRole("region", { name: "Pick sheet for Luton 1" })).toBeVisible();
        await settle(page);
        await expectNoOverflow(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/warehouse-pick-sheet.png`,
          fullPage: true,
        });
        await page
          .getByRole("button", { name: /^Flag shortage: / })
          .first()
          .click();
        await expect(page.getByRole("dialog", { name: "Flag a shortage" })).toBeVisible();
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-shortage.png` });
      });

      test("history and asset screens", async ({ page }) => {
        await page.goto("/history?q=HS-50");
        await expect(page.getByRole("region", { name: "Results" })).toBeVisible();
        await settle(page);
        await expectNoOverflow(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/history-results.png`,
          fullPage: true,
        });
        await page.goto("/history/assets");
        await expect(page.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
        await settle(page);
        await expectNoOverflow(page);
        await page.screenshot({
          path: `screenshots/${theme}/${width}/history-assets.png`,
          fullPage: true,
        });
        await page.getByText("ST-202", { exact: true }).locator("visible=true").first().click();
        await expect(page.getByRole("dialog", { name: "ST-202" })).toBeVisible();
        await settle(page);
        await page.screenshot({ path: `screenshots/${theme}/${width}/state-asset-panel.png` });
        await page.keyboard.press("Escape");
        await page.goto("/settings/standing-runs");
        await page.getByRole("button", { name: "Add standing run" }).first().click();
        await expect(page.getByRole("dialog", { name: "Add standing run" })).toBeVisible();
        await page.screenshot({
          path: `screenshots/${theme}/${width}/state-standing-run-form.png`,
        });
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
          // The record form, while today's run still has stops to do (driver.spec records them).
          const record = page
            .getByRole("article", { name: /^Stop 2: / })
            .getByRole("button", { name: "Part delivered" });
          if (await record.count()) {
            await record.click();
            const sheet = page.getByRole("dialog");
            await expect(sheet.getByRole("radio", { name: "Part delivered" })).toBeVisible();
            await settle(page);
            await page.screenshot({ path: `screenshots/${theme}/${width}/driver-record.png` });
            await sheet.getByRole("radio", { name: "Failed" }).click();
            await page.screenshot({ path: `screenshots/${theme}/${width}/driver-failed.png` });
            await page.keyboard.press("Escape");
          }
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
