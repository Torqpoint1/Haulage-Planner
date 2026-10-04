/**
 * Asset numbers typed when adding returnable assets: one per line or comma
 * separated, with ranges like "ST-101 to ST-120" (same prefix, numbers kept
 * at the same width, so "ST-098 to ST-102" gives ST-098 … ST-102).
 */

export const MAX_NEW_ASSETS = 200;

export type ParsedNumbers = { numbers: string[]; errors: string[] };

const RANGE = /^(.*?)(\d+)\s*(?:to|-|–)\s*(.*?)(\d+)$/i;

export function parseAssetNumbers(text: string): ParsedNumbers {
  const numbers: string[] = [];
  const errors: string[] = [];
  const parts = text
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const m = / to /i.test(part) ? part.match(RANGE) : null;
    if (!m) {
      if (part.length > 40)
        errors.push(`“${part.slice(0, 20)}…” is too long (40 characters at most).`);
      else numbers.push(part);
      continue;
    }
    const [, prefixA, fromText, prefixB, toText] = m;
    const prefix = prefixA;
    if (prefixB.trim() && prefixB.trim().toUpperCase() !== prefix.trim().toUpperCase()) {
      errors.push(`“${part}”: both ends of a range need the same start, e.g. ST-101 to ST-120.`);
      continue;
    }
    const from = Number(fromText);
    const to = Number(toText);
    if (to < from) {
      errors.push(`“${part}”: the range runs backwards.`);
      continue;
    }
    if (to - from + 1 > MAX_NEW_ASSETS) {
      errors.push(`“${part}” is more than ${MAX_NEW_ASSETS} assets.`);
      continue;
    }
    const width = fromText.length;
    for (let n = from; n <= to; n++) numbers.push(`${prefix}${String(n).padStart(width, "0")}`);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const n of numbers) {
    const key = n.toUpperCase();
    if (seen.has(key)) errors.push(`${n} is listed twice.`);
    else {
      seen.add(key);
      unique.push(n);
    }
  }
  if (unique.length > MAX_NEW_ASSETS)
    errors.push(`Add up to ${MAX_NEW_ASSETS} assets at a time (${unique.length} listed).`);
  if (!unique.length && !errors.length) errors.push("Enter at least one asset number.");
  return { numbers: unique, errors };
}
