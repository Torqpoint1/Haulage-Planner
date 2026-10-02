/**
 * UK postcode helpers. Postcodes are stored in their normal form ("GL5 3AA"),
 * which the database also enforces.
 */

const POSTCODE = /^([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})$/;

/** "gl53aa" → "GL5 3AA", or null if it isn't a valid UK postcode. */
export function normalisePostcode(input: string): string | null {
  const match = POSTCODE.exec(input.trim().toUpperCase().replace(/\s+/g, " "));
  return match ? `${match[1]} ${match[2]}` : null;
}

/** The area: the leading letters, e.g. "GL" for "GL5 3AA", "B" for "B1 1AA". */
export function postcodeArea(postcode: string): string {
  return /^[A-Z]{1,2}/.exec(postcode.trim().toUpperCase())?.[0] ?? "";
}

/** The outward code (district), e.g. "GL5" for "GL5 3AA". */
export function postcodeDistrict(postcode: string): string {
  return normalisePostcode(postcode)?.split(" ")[0] ?? "";
}

/** Parse a list of postcode areas typed as "GL, NP sn" into ["GL", "NP", "SN"]. */
export function parseAreas(input: string): { areas: string[]; invalid: string[] } {
  const parts = input
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const areas = [...new Set(parts.filter((p) => /^[A-Z]{1,2}$/.test(p)))].sort();
  const invalid = parts.filter((p) => !/^[A-Z]{1,2}$/.test(p));
  return { areas, invalid };
}

/** Areas or districts for remote-area surcharges, e.g. "IV, PA20, ZE". */
export function parseAreasOrDistricts(input: string): { values: string[]; invalid: string[] } {
  const parts = input
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const ok = (p: string) => /^[A-Z]{1,2}[0-9]{0,2}[A-Z]?$/.test(p);
  return { values: [...new Set(parts.filter(ok))].sort(), invalid: parts.filter((p) => !ok(p)) };
}
