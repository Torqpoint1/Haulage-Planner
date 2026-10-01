import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the design system (spec 0 rule 2, section 10): no one-off colours,
 * font sizes or spacing values. Tailwind silently ignores classes that don't
 * exist in our reset theme, so this test catches them instead.
 */

const ROOT = join(process.cwd(), "src");
const ALLOWED_SPACING = new Set(["0", "px", "1", "2", "3", "4", "6", "8", "12", "16"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const SPACING_UTILS =
  "p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|top|left|right|bottom|inset|inset-x|inset-y|translate-x|translate-y|scroll-mt";

const rules: { name: string; re: RegExp; allow?: (m: RegExpMatchArray) => boolean }[] = [
  {
    name: "spacing outside the 4/8/12/16/24/32/48/64 scale",
    re: new RegExp(`(?<![\\w-])-?(?:${SPACING_UTILS})-(\\d+(?:\\.\\d+)?)(?![\\w./-])`, "g"),
    allow: (m) => ALLOWED_SPACING.has(m[1]),
  },
  {
    name: "font size outside 12/14/16/20/24/32",
    re: /(?<![\w-])text-(3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[\d)/g,
  },
  {
    name: "font weight other than 400/500/600",
    re: /(?<![\w-])font-(thin|extralight|light|bold|extrabold|black)(?![\w-])/g,
  },
  {
    name: "radius other than sm/md/lg/full",
    re: /(?<![\w-])rounded(?:-[trbl]{1,2})?-(xs|xl|2xl|3xl|4xl)(?![\w-])/g,
  },
  {
    name: "arbitrary value (use a token instead)",
    // Allows CSS-variable shorthands like p-(--card-padding) and variants like data-[state=open]:
    re: /(?<![\w-])(?:[a-z]+-)+\[(?!state|highlighted|disabled|placeholder|selected|side)[^\]]+\]/g,
  },
  {
    name: "raw colour in class name",
    re: /(?<![\w-])(?:bg|text|border|fill|stroke|ring|outline)-(?:red|amber|green|blue|slate|gray|zinc|neutral|stone|orange|yellow|emerald|sky|indigo|violet|rose|pink)-\d{2,3}/g,
  },
];

describe("design token usage", () => {
  const sources = files(ROOT);

  it("finds source files", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  for (const rule of rules) {
    it(`has no ${rule.name}`, () => {
      const problems: string[] = [];
      for (const file of sources) {
        const text = readFileSync(file, "utf8");
        // Only inspect string literals, where class names live.
        for (const lit of text.matchAll(/"[^"\n]*"|`[^`]*`/g)) {
          for (const m of lit[0].matchAll(rule.re)) {
            if (rule.allow?.(m)) continue;
            problems.push(`${relative(process.cwd(), file)}: ${m[0]}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
