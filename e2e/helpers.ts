import { expect, type Page } from "@playwright/test";

/** The three widths every screen must work at (spec 10.7). */
export const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

export const THEMES = ["light", "dark"] as const;

export const SCREENS = [
  { path: "/today", title: "Today" },
  { path: "/plan", title: "Plan" },
  { path: "/orders", title: "Orders" },
  { path: "/customers", title: "Customers" },
  { path: "/warehouse", title: "Warehouse" },
  { path: "/history", title: "History" },
  { path: "/settings", title: "Settings" },
] as const;

/** Set theme and density before the page loads, as a returning user would have. */
export async function setPreferences(page: Page, theme: "light" | "dark", density = "comfortable") {
  await page.addInitScript(
    ([t, d]) => {
      localStorage.setItem("hp-theme", t);
      localStorage.setItem("hp-density", d);
    },
    [theme, density],
  );
}

/**
 * Layout checks for 10.7: no horizontal page scroll, and no visible text
 * spilling out of its box. Elements that deliberately clip (truncate,
 * scroll containers) are skipped.
 */
export async function expectNoOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const pageOverflow = doc.scrollWidth - doc.clientWidth;
    const spills: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (el.closest(".leaflet-container, [aria-hidden='true'], .sr-only")) continue;
      if (["hidden", "auto", "scroll", "clip"].includes(style.overflowX)) continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const hasOwnText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
        );
        if (hasOwnText)
          spills.push(`${el.tagName.toLowerCase()}: "${el.textContent?.trim().slice(0, 40)}"`);
      }
    }
    return { pageOverflow, spills };
  });
  expect(result.pageOverflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
  expect(result.spills, "text spills out of its container").toEqual([]);
}
