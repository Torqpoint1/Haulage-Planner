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
      const hasOwnText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      if (!hasOwnText) continue;
      const label = `${el.tagName.toLowerCase()}: "${el.textContent?.trim().slice(0, 40)}"`;
      if (
        !["hidden", "auto", "scroll", "clip"].includes(style.overflowX) &&
        el.scrollWidth > el.clientWidth + 1 &&
        el.clientWidth > 0
      ) {
        spills.push(label);
        continue;
      }
      // Text that fits its own box but sticks out of the bordered card or panel around it.
      const box = el.parentElement?.closest<HTMLElement>("article, li, [role='dialog'], section");
      // Content inside a scrolling or clipping container is meant to move; skip it.
      let clipped = false;
      for (let a = el.parentElement; a && box && a !== box; a = a.parentElement) {
        if (["hidden", "auto", "scroll", "clip"].includes(getComputedStyle(a).overflowX))
          clipped = true;
      }
      if (box && !clipped && style.position !== "absolute" && style.position !== "fixed") {
        const r = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1))
          spills.push(`${label} (outside its card)`);
      }
    }
    return { pageOverflow, spills };
  });
  expect(result.pageOverflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
  expect(result.spills, "text spills out of its container").toEqual([]);
}
