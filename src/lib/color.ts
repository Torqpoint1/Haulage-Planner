/**
 * Colour helpers for the per-organisation accent (spec 10.3): the app checks
 * contrast and adjusts colours automatically so any brand colour stays
 * readable (WCAG 2.2 AA) in both light and dark mode.
 */

export type Rgb = { r: number; g: number; b: number };
export type ThemeMode = "light" | "dark";

export const DEFAULT_ACCENT = "#1d4ed8";

/** Surfaces the accent is drawn on, kept in sync with globals.css. */
export const SURFACES: Record<ThemeMode, { bg: string; surface: string }> = {
  light: { bg: "#f6f7f9", surface: "#ffffff" },
  dark: { bg: "#0d1015", surface: "#151920" },
};

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColour(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function parseHex(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  let body = match[1];
  if (body.length === 3) body = body.replace(/./g, (c) => c + c);
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two colours; `amount` 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * amount,
    g: ca.g + (cb.g - ca.g) * amount,
    b: ca.b + (cb.b - ca.b) * amount,
  });
}

const WHITE = "#ffffff";
const INK = "#15191f";

/** Pick white or near-black text, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/**
 * Step `colour` towards `target` (white or black) until `test` passes.
 * Returns the original colour if it already passes.
 */
function adjustUntil(colour: string, target: string, test: (c: string) => boolean): string {
  for (let i = 0; i <= 40; i++) {
    const candidate = mix(colour, target, i / 40);
    if (test(candidate)) return candidate;
  }
  return target;
}

export type AccentTokens = {
  accent: string;
  accentHover: string;
  accentFg: string;
  accentSubtle: string;
  accentText: string;
  focus: string;
};

/**
 * Derive every accent token for one theme from an organisation's brand colour.
 *
 * - `accent` (button fill) must reach 3:1 against the surface so the button
 *   is visible, and its text colour must reach 4.5:1 against it.
 * - `accentText` (links, active tab label) must reach 4.5:1 against both
 *   the page background and card surface.
 * - `focus` rings must reach 3:1 against both.
 */
export function deriveAccentTokens(brand: string, mode: ThemeMode): AccentTokens {
  const base = isHexColour(brand) ? toHex(parseHex(brand)) : DEFAULT_ACCENT;
  const { bg, surface } = SURFACES[mode];
  const towardsContrast = mode === "light" ? "#000000" : WHITE;

  const visible = (c: string) => contrastRatio(c, surface) >= 3 && contrastRatio(c, bg) >= 3;

  // Fill: visible on the surface and able to carry readable text.
  const fillOk = (c: string) => visible(c) && contrastRatio(c, readableTextOn(c)) >= 4.5;
  let accent = adjustUntil(base, towardsContrast, fillOk);
  if (!fillOk(accent)) {
    // Very light brand colours in light mode: darken until white text works.
    accent = adjustUntil(base, "#000000", (c) => visible(c) && contrastRatio(c, WHITE) >= 4.5);
  }
  const accentFg = readableTextOn(accent);
  // Hover moves away from the text colour so the label only gets clearer.
  const accentHover = mix(accent, accentFg === WHITE ? "#000000" : WHITE, 0.12);

  const readable = (c: string) => contrastRatio(c, surface) >= 4.5 && contrastRatio(c, bg) >= 4.5;
  const accentText = adjustUntil(base, towardsContrast, readable);
  const focus = adjustUntil(base, towardsContrast, visible);

  const accentSubtle = mode === "light" ? mix(base, WHITE, 0.9) : mix(base, surface, 0.82);

  return { accent, accentHover, accentFg, accentSubtle, accentText, focus };
}

/** CSS for the accent variables in both themes, injected in the root layout. */
export function accentCss(brand: string): string {
  const decl = (t: AccentTokens) =>
    `--accent:${t.accent};--accent-hover:${t.accentHover};--accent-fg:${t.accentFg};` +
    `--accent-subtle:${t.accentSubtle};--accent-text:${t.accentText};--focus:${t.focus};`;
  return (
    `:root{${decl(deriveAccentTokens(brand, "light"))}}` +
    `.dark{${decl(deriveAccentTokens(brand, "dark"))}}`
  );
}
