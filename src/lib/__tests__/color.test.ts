import { describe, expect, it } from "vitest";
import {
  SURFACES,
  accentCss,
  contrastRatio,
  deriveAccentTokens,
  isHexColour,
  mix,
  parseHex,
  readableTextOn,
  toHex,
} from "@/lib/color";

describe("hex parsing", () => {
  it("parses 3 and 6 digit hex with or without #", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("1d4ed8")).toEqual({ r: 29, g: 78, b: 216 });
    expect(toHex(parseHex("#ABC"))).toBe("#aabbcc");
  });

  it("rejects non-hex input", () => {
    expect(isHexColour("blue")).toBe(false);
    expect(() => parseHex("#12345")).toThrow();
  });
});

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("picks readable text for light and dark fills", () => {
    expect(readableTextOn("#1d4ed8")).toBe("#ffffff");
    expect(readableTextOn("#ffe066")).not.toBe("#ffffff");
  });

  it("mixes colours", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
});

describe("deriveAccentTokens", () => {
  // A spread of awkward brand colours: very light, very dark, saturated, grey.
  const brands = [
    "#1d4ed8",
    "#ffe066",
    "#ffffff",
    "#000000",
    "#00ff00",
    "#ff6600",
    "#e11d48",
    "#14b8a6",
    "#7c3aed",
    "#888888",
    "#0b1f3a",
    "#fde68a",
  ];

  for (const mode of ["light", "dark"] as const) {
    const { bg, surface } = SURFACES[mode];
    for (const brand of brands) {
      it(`keeps ${brand} accessible in ${mode} mode`, () => {
        const t = deriveAccentTokens(brand, mode);
        expect(contrastRatio(t.accent, t.accentFg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.accentHover, t.accentFg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.accent, surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t.accentText, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.accentText, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.focus, surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(t.focus, bg)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("leaves an already accessible brand colour unchanged in light mode", () => {
    expect(deriveAccentTokens("#1d4ed8", "light").accent).toBe("#1d4ed8");
  });

  it("falls back to the default accent for invalid input", () => {
    expect(deriveAccentTokens("not-a-colour", "light").accent).toBe("#1d4ed8");
  });

  it("emits CSS for both themes", () => {
    const css = accentCss("#e11d48");
    expect(css).toMatch(/^:root\{--accent:#[0-9a-f]{6};/);
    expect(css).toContain(".dark{--accent:");
  });
});
