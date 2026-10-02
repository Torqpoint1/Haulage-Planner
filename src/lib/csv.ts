/**
 * Small, dependency-free CSV reader and writer (RFC 4180): quoted fields,
 * doubled quotes, commas and line breaks inside quotes, CRLF, a UTF-8 BOM
 * from Excel, and semicolon-separated files from European locales.
 */

export type CsvTable = { headers: string[]; rows: string[][] };

function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<"," | ";" | "\t", number>;
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as "," | ";" | "\t"]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t") ?? ",";
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headerRow = [], ...rows] = nonEmpty;
  const headers = headerRow.map((h) => h.trim());
  // Pad or trim each row to the header width so columns always line up.
  return { headers, rows: rows.map((r) => headers.map((_, i) => (r[i] ?? "").trim())) };
}

function escapeCell(value: string): string {
  // Prefix cells that spreadsheets would treat as formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows.map((r) => r.map((c) => (c == null ? "" : String(c))))];
  return "﻿" + lines.map((line) => line.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
