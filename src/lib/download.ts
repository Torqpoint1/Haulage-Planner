import { toCsv } from "./csv";

/** Save a CSV in the browser (Excel-friendly: BOM, CRLF). */
export function downloadCsv(
  fileName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
