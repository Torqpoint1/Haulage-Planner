import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SURFACES, contrastRatio } from "@/lib/color";

/**
 * WCAG 2.2 AA contrast for the design tokens in both themes (spec 10.9).
 * Reads globals.css directly so the CSS stays the single source of truth.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]] = m[2];
  return vars;
}

const themes = { light: block(":root"), dark: block(".dark") };

// [foreground, background, minimum ratio]
const TEXT = 4.5;
const UI = 3;
const pairs: [string, string, number][] = [
  ["text", "bg", TEXT],
  ["text", "surface", TEXT],
  ["text", "surface-muted", TEXT],
  ["text-muted", "bg", TEXT],
  ["text-muted", "surface", TEXT],
  ["text-muted", "surface-muted", TEXT],
  ["text-subtle", "bg", TEXT],
  ["text-subtle", "surface", TEXT],
  ["text-subtle", "surface-muted", TEXT],
  ["accent-fg", "accent", TEXT],
  ["accent-text", "surface", TEXT],
  ["accent-text", "bg", TEXT],
  ["accent-text", "accent-subtle", TEXT],
  ["focus", "surface", UI],
  ["focus", "bg", UI],
  ["border-strong", "surface", 1.5],
  ["danger-fg", "danger-bg", TEXT],
  ["warning-fg", "warning-bg", TEXT],
  ["success-fg", "success-bg", TEXT],
  ["info-fg", "info-bg", TEXT],
  ["danger-fg", "surface", TEXT],
  ["warning-fg", "surface", TEXT],
  ["success-fg", "surface", TEXT],
  ["info-fg", "surface", TEXT],
  ["danger", "surface", UI],
  ["warning", "surface", 2.5],
  ["success", "surface", UI],
  ["info", "surface", UI],
];

describe.each(Object.entries(themes))("%s theme tokens", (mode, vars) => {
  it.each(pairs)("%s on %s", (fg, bg, min) => {
    expect(vars[fg], `--${fg}`).toBeDefined();
    expect(vars[bg], `--${bg}`).toBeDefined();
    expect(contrastRatio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(min);
  });

  it("white text is readable on the danger button", () => {
    expect(contrastRatio("#ffffff", vars["danger-solid"])).toBeGreaterThanOrEqual(TEXT);
    expect(contrastRatio("#ffffff", vars["danger-solid-hover"])).toBeGreaterThanOrEqual(TEXT);
  });

  it("matches the surfaces used to derive organisation accents", () => {
    const s = SURFACES[mode as keyof typeof SURFACES];
    expect(vars.bg).toBe(s.bg);
    expect(vars.surface).toBe(s.surface);
  });

  it("defines a 10-colour load palette visible on the surface", () => {
    for (let i = 1; i <= 10; i++) {
      expect(contrastRatio(vars[`load-${i}`], vars.surface)).toBeGreaterThanOrEqual(UI);
    }
  });
});
