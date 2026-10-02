"use client";

import { CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Stat, StatGroup } from "@/components/ui/stat";
import { DataTable, type Column } from "@/components/ui/table";
import { Truncate } from "@/components/ui/truncate";
import { parseCsv, type CsvTable } from "@/lib/csv";
import { downloadCsv } from "@/lib/download";
import { formatIsoDate, formatNumber, londonToday, plural } from "@/lib/format";
import {
  exampleDate,
  MAX_IMPORT_ROWS,
  missingRequired,
  ORDER_IMPORT_FIELDS,
  suggestMapping,
  type Mapping,
  type RowResult,
} from "@/lib/orders/import";
import { previewOrderImport, runOrderImport } from "../actions";

const NONE = "__none";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SHOWN_PROBLEMS = 200;

type Preview = { rowCount: number; orderCount: number; lineCount: number; rejected: RowResult[] };
type Step =
  | { name: "file" }
  | { name: "map" }
  | { name: "check"; preview: Preview }
  | { name: "done"; imported: number; rejected: RowResult[] };

const STEPS = ["Choose file", "Match columns", "Check", "Import"] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={
            i === current
              ? "flex items-center gap-2 text-sm font-semibold"
              : "flex items-center gap-2 text-sm text-text-muted"
          }
        >
          <span
            className={
              i <= current
                ? "flex size-6 items-center justify-center rounded-full bg-accent text-xs text-accent-fg"
                : "flex size-6 items-center justify-center rounded-full border border-border text-xs"
            }
          >
            {i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}

/** Excel saves CSVs in Windows-1252 unless told otherwise; accept both. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function downloadTemplate() {
  const headers = ORDER_IMPORT_FIELDS.map((f) => f.label);
  const when = formatIsoDate(exampleDate());
  const example: Record<string, string> = {
    order_ref: "SO-1001",
    customer: "Your customer's name or account ref",
    site: "GL1 2BB",
    customer_po: "PO-5521",
    required_date: when,
    urgency: "Standard",
    readiness: "Ready",
    unit_type: "Your unit type's code",
    quantity: "4",
  };
  const second: Record<string, string> = {
    ...example,
    unit_type: "Another unit type's code",
    quantity: "1",
  };
  downloadCsv(
    "order-import-template.csv",
    headers,
    [example, second].map((row) => ORDER_IMPORT_FIELDS.map((f) => row[f.key] ?? "")),
  );
}

/** Only the mapped columns go to the server, keeping the request small. */
function trimmed(table: CsvTable, mapping: Mapping): CsvTable {
  const headers = [...new Set(Object.values(mapping).filter((h): h is string => Boolean(h)))];
  const idx = headers.map((h) => table.headers.indexOf(h));
  return { headers, rows: table.rows.map((r) => idx.map((i) => r[i] ?? "")) };
}

function downloadProblems(table: CsvTable, rejected: RowResult[]) {
  // Original columns plus the problem, so the file can be fixed and imported again.
  const byRow = new Map(rejected.map((r) => [r.row, r.errors.join(" ")]));
  const rows = table.rows
    .map((r, i) => ({ r, problem: byRow.get(i + 2) }))
    .filter((x) => x.problem)
    .map((x) => [...x.r, x.problem!]);
  downloadCsv(`order-import-problems-${londonToday()}.csv`, [...table.headers, "Problem"], rows);
}

const problemColumns: Column<RowResult>[] = [
  {
    id: "row",
    header: "Row",
    cell: (r) => <span className="num">{r.row}</span>,
    className: "w-16",
  },
  { id: "ref", header: "Order ref", cell: (r) => <Truncate>{r.orderRef || "–"}</Truncate> },
  {
    id: "problem",
    header: "Problem",
    cell: (r) => <span className="break-words whitespace-normal">{r.errors.join(" ")}</span>,
  },
];

function ProblemList({ rejected, table }: { rejected: RowResult[]; table: CsvTable }) {
  if (!rejected.length) return null;
  const shown = rejected.slice(0, SHOWN_PROBLEMS);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{plural(rejected.length, "row")} won&apos;t be imported</CardTitle>
        <Button size="sm" onClick={() => downloadProblems(table, rejected)}>
          <Download aria-hidden />
          Download problem rows
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">
          Row numbers match your spreadsheet (row 1 is the header). The download has your original
          columns plus a Problem column: fix the rows, then import that file.
        </p>
        <DataTable
          label="Rows that won't be imported"
          columns={problemColumns}
          rows={shown}
          getRowId={(r) => String(r.row)}
          scrollClassName="max-h-panel"
          renderCard={(r) => (
            <div className="flex min-w-0 flex-col gap-1 p-3">
              <span className="text-sm font-medium">
                Row <span className="num">{r.row}</span>
                {r.orderRef ? ` · ${r.orderRef}` : ""}
              </span>
              <span className="text-sm break-words text-text-muted">{r.errors.join(" ")}</span>
            </div>
          )}
        />
        {rejected.length > shown.length ? (
          <p className="text-sm text-text-muted">
            Showing the first {SHOWN_PROBLEMS}. The download has all {formatNumber(rejected.length)}
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ImportWizard({ remembered }: { remembered: Mapping }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ name: "file" });
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CsvTable>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState(false);
  const usedRemembered = Object.keys(remembered).length > 0;

  async function choose(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES)
      return setError("That file is over 5 MB. Split it into smaller files.");
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.includes("csv")) {
      return setError("Choose a CSV file. In Excel, use File › Save As › CSV.");
    }
    const parsed = parseCsv(await readText(file));
    if (!parsed.headers.length) return setError("That file is empty.");
    if (!parsed.rows.length) return setError("That file has a header row but no orders under it.");
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      return setError(
        `That file has ${formatNumber(parsed.rows.length)} rows. Split it into files of ${formatNumber(MAX_IMPORT_ROWS)} or fewer.`,
      );
    }
    setFileName(file.name);
    setTable(parsed);
    setMapping(suggestMapping(parsed.headers, remembered));
    setStep({ name: "map" });
  }

  function check() {
    setError(null);
    start(async () => {
      const result = await previewOrderImport(trimmed(table, mapping), mapping);
      if (!result.ok) return setError(result.error);
      setStep({ name: "check", preview: result.plan });
    });
  }

  function runImport() {
    setError(null);
    start(async () => {
      const result = await runOrderImport(trimmed(table, mapping), mapping);
      if (!result.ok) return setError(result.error);
      setStep({ name: "done", imported: result.imported, rejected: result.rejected });
      router.refresh();
    });
  }

  function reset() {
    setStep({ name: "file" });
    setTable({ headers: [], rows: [] });
    setError(null);
    if (input.current) input.current.value = "";
  }

  const current = { file: 0, map: 1, check: 2, done: 3 }[step.name];
  const missing = missingRequired(mapping);
  const headerOptions = [
    { value: NONE, label: "Not in this file" },
    ...table.headers.map((h, i) => ({ value: h, label: h || `Column ${i + 1}` })),
  ];
  const sample = (header: string | undefined) => {
    if (!header) return "";
    const i = table.headers.indexOf(header);
    return table.rows.find((r) => r[i]?.trim())?.[i] ?? "";
  };

  const errorBox = error ? (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg"
    >
      <TriangleAlert className="size-icon-sm shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{error}</span>
    </div>
  ) : null;

  return (
    <div className="flex max-w-content flex-col gap-6">
      <Steps current={current} />
      {errorBox}

      {step.name === "file" ? (
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) void choose(file);
              }}
              className={
                dragging
                  ? "flex flex-col items-center gap-3 rounded-lg border border-dashed border-accent bg-accent-subtle p-8 text-center"
                  : "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center"
              }
            >
              <FileSpreadsheet className="size-8 text-text-muted" aria-hidden />
              <p className="text-sm font-medium">Drop a CSV file here, or</p>
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose a CSV file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void choose(file);
                }}
              />
              <Button variant="primary" onClick={() => input.current?.click()}>
                <Upload aria-hidden />
                Choose file
              </Button>
              <p className="text-xs text-text-muted">
                Up to {formatNumber(MAX_IMPORT_ROWS)} rows. One row per order line; rows with the
                same order ref become one order.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Not sure what to include?</h2>
              <p className="text-sm text-text-muted">
                You need an order ref, customer, required date, unit type and quantity. Column names
                don&apos;t have to match; you&apos;ll choose which column is which next.
              </p>
              <Button className="w-fit" onClick={downloadTemplate}>
                <Download aria-hidden />
                Download template
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step.name === "map" ? (
        <Card>
          <CardHeader>
            <CardTitle>Match your columns</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-text-muted">
              <span className="font-medium text-text">{fileName}</span> has{" "}
              {plural(table.rows.length, "row")}.{" "}
              {usedRemembered
                ? "We've used the matches from your last import where the columns are the same."
                : "We've guessed from the column names; check them."}
            </p>
            <div className="grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-2">
              {ORDER_IMPORT_FIELDS.map((f) => {
                const header = mapping[f.key];
                const example = sample(header);
                const required = "required" in f && f.required;
                return (
                  <Field
                    key={f.key}
                    label={required ? `${f.label} *` : f.label}
                    hint={
                      example ? (
                        <Truncate>{`e.g. ${example}`}</Truncate>
                      ) : "hint" in f && f.hint ? (
                        f.hint
                      ) : undefined
                    }
                    error={required && !header ? "Required" : undefined}
                  >
                    <Select
                      options={headerOptions}
                      value={header ?? NONE}
                      onValueChange={(v) =>
                        setMapping({ ...mapping, [f.key]: v === NONE ? undefined : v })
                      }
                    />
                  </Field>
                );
              })}
            </div>
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-between">
              <Button onClick={reset}>Choose a different file</Button>
              <Button
                variant="primary"
                loading={pending}
                disabled={missing.length > 0}
                onClick={check}
              >
                Check {plural(table.rows.length, "row")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step.name === "check" ? (
        <>
          <StatGroup>
            <Stat label="Rows in file" value={formatNumber(step.preview.rowCount)} />
            <Stat label="Orders to import" value={formatNumber(step.preview.orderCount)} />
            <Stat label="Order lines" value={formatNumber(step.preview.lineCount)} />
            <Stat label="Problem rows" value={formatNumber(step.preview.rejected.length)} />
          </StatGroup>
          {step.preview.orderCount === 0 ? (
            <p className="text-sm">
              None of the rows can be imported yet. Fix the problems below, or go back and check the
              column matches.
            </p>
          ) : null}
          <ProblemList rejected={step.preview.rejected} table={table} />
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-between">
            <Button onClick={() => setStep({ name: "map" })}>Back to columns</Button>
            {step.preview.orderCount > 0 ? (
              <Button variant="primary" loading={pending} onClick={runImport}>
                Import {plural(step.preview.orderCount, "order")}
                {step.preview.rejected.length ? ", skip the rest" : ""}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {step.name === "done" ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-start gap-3">
              <Badge tone="success" icon={<CircleCheck aria-hidden />}>
                Imported
              </Badge>
              <p className="text-lg font-semibold">{plural(step.imported, "order")} imported</p>
              <p className="text-sm text-text-muted">
                {step.rejected.length
                  ? `${plural(step.rejected.length, "row")} ${step.rejected.length === 1 ? "wasn't" : "weren't"} imported. Download them, fix them and import that file.`
                  : "Every row was imported."}{" "}
                Your column matches are saved for next time.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" asChild>
                  <Link href="/orders">View orders</Link>
                </Button>
                <Button onClick={reset}>Import another file</Button>
              </div>
            </CardContent>
          </Card>
          <ProblemList rejected={step.rejected} table={table} />
        </>
      ) : null}
    </div>
  );
}
