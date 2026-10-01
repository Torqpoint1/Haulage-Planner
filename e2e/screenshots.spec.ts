import { expect, test, type Page } from "@playwright/test";
import { SCREENS, THEMES, WIDTHS, setPreferences } from "./helpers";

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
