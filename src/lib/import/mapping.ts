/**
 * Column matching shared by every CSV import (spec 11): suggest which column
 * holds each field, remembered per organisation, and say which required
 * fields are still unmatched.
 */

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Header names this field is recognised by when suggesting a mapping. */
  aliases: readonly string[];
};

/** Field key → CSV header. */
export type FieldMapping = Partial<Record<string, string>>;

/** One spreadsheet row that won't be imported, and why. */
export type ImportProblem = { row: number; ref: string; errors: string[] };

/** Larger files should be split; keeps a single import quick and the preview readable. */
export const MAX_IMPORT_ROWS = 5000;

/** Spreadsheet row number for data row i (the header is row 1). */
export const rowNumber = (i: number) => i + 2;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The organisation's remembered mapping first (where those headers still
 * exist), then exact names and aliases, then headers containing a field's name.
 */
export function suggestFieldMapping(
  fields: readonly ImportField[],
  headers: string[],
  remembered: FieldMapping = {},
): FieldMapping {
  const out: FieldMapping = {};
  const used = new Set<string>();
  const take = (key: string, header: string | undefined) => {
    if (header && !used.has(header) && !out[key]) {
      out[key] = header;
      used.add(header);
    }
  };
  for (const f of fields) {
    const r = remembered[f.key];
    if (r && headers.includes(r)) take(f.key, r);
  }
  for (const f of fields) {
    const names = [f.key, f.label, ...f.aliases].map(norm);
    take(
      f.key,
      headers.find((h) => names.includes(norm(h)) && !used.has(h)),
    );
  }
  for (const f of fields) {
    const label = norm(f.label);
    take(
      f.key,
      headers.find((h) => !used.has(h) && norm(h).includes(label)),
    );
  }
  return out;
}

export function missingFields(fields: readonly ImportField[], mapping: FieldMapping): string[] {
  return fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}

/** Reads a mapped field from a row, trimmed; blank when the field isn't mapped. */
export function fieldReader(
  fields: readonly ImportField[],
  headers: string[],
  mapping: FieldMapping,
) {
  const col = Object.fromEntries(
    fields.map((f) => [f.key, mapping[f.key] ? headers.indexOf(mapping[f.key]!) : -1]),
  );
  return (row: string[], key: string) => (col[key] >= 0 ? (row[col[key]] ?? "").trim() : "");
}

/** Checks a table before planning: rows present, not too many, required fields matched. */
export function checkImportTable(
  rows: number,
  fields: readonly ImportField[],
  mapping: FieldMapping,
): string | null {
  if (!rows) return "That file has no rows under the header.";
  if (rows > MAX_IMPORT_ROWS) {
    return `That file has ${rows.toLocaleString("en-GB")} rows. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString("en-GB")} or fewer.`;
  }
  const missing = missingFields(fields, mapping);
  if (missing.length) return `Choose a column for ${missing.join(", ")}.`;
  return null;
}

const YES = new Set(["y", "yes", "true", "1", "x", "✓"]);
const NO = new Set(["", "n", "no", "false", "0"]);
/** Yes/no cells: null when it's neither. */
export function yesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}
