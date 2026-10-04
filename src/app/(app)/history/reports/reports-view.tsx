"use client";

import { BarChart3, Download } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Stat, StatGroup } from "@/components/ui/stat";
import { downloadCsv } from "@/lib/download";
import {
  formatGbp,
  formatIsoDate,
  formatPercent,
  fromIsoDate,
  plural,
  toIsoDate,
} from "@/lib/format";
import { recentMonths } from "@/lib/history/filters";
import type { Report } from "@/lib/reports/compute";

const CUSTOM = "custom";
const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${m}-01T12:00:00Z`),
  );

/** A row's cost with "est." when any of it is estimated, and a note on unpriced loads. */
function Money({ value, estimate }: { value: number | null; estimate?: boolean }) {
  if (value == null) return <span className="text-text-subtle">No price</span>;
  return (
    <span className="num">
      {formatGbp(value)}
      {estimate ? <span className="text-text-muted"> est.</span> : null}
    </span>
  );
}

/** A simple table that stacks into labelled rows on phones. */
function ReportTable({
  label,
  headers,
  rows,
  numeric,
}: {
  label: string;
  headers: string[];
  rows: React.ReactNode[][];
  /** Column indexes to right-align. */
  numeric: number[];
}) {
  return (
    <>
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table aria-label={label} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={
                    numeric.includes(i)
                      ? "px-2 py-2 text-right font-medium"
                      : "px-2 py-2 font-medium"
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border last:border-0">
                {r.map((c, i) => (
                  <td
                    key={i}
                    className={numeric.includes(i) ? "num px-2 py-2 text-right" : "px-2 py-2"}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={label} className="flex flex-col divide-y divide-border md:hidden">
        {rows.map((r, ri) => (
          <li key={ri} className="flex flex-col gap-1 py-2">
            <span className="text-sm font-semibold">{r[0]}</span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {r.slice(1).map((c, i) =>
                c === "" ? null : (
                  <div key={i} className="contents">
                    <dt className="text-text-muted">{headers[i + 1]}</dt>
                    <dd className="text-right">{c}</dd>
                  </div>
                ),
              )}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ReportsView({
  report,
  from,
  to,
  month,
  today,
}: {
  report: Report;
  from: string;
  to: string;
  month: string | null;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState(month ?? CUSTOM);
  const [range, setRange] = useState({ from, to });
  const go = (q: string) => start(() => router.push(`${pathname}?${q}`));
  const period = month ? monthLabel(month) : `${formatIsoDate(from)} to ${formatIsoDate(to)}`;
  const { costPerDrop, fill, failed, spend } = report;

  function exportCsv() {
    downloadCsv(
      `reports-${from}-to-${to}.csv`,
      ["Report", "Name", "Month", "Loads", "Drops", "Value", "Estimated"],
      [
        ...costPerDrop.rows.map((r) => [
          "Cost per drop",
          r.name,
          "",
          r.loads,
          r.drops,
          r.perDrop ?? "",
          r.estimate ? "yes" : "no",
        ]),
        ...fill.map((r) => [
          "Vehicle fill %",
          r.name,
          "",
          r.loads,
          "",
          Math.round(r.average * 100),
          "no",
        ]),
        ...failed.byReason.map((r) => ["Failed deliveries", r.label, "", "", "", r.count, "no"]),
        ...spend.rows.map((r) => [
          "Haulier spend",
          r.haulier,
          r.month,
          r.loads,
          "",
          r.total,
          r.estimated ? "partly" : "no",
        ]),
      ],
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form
        aria-label="Report period"
        className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          go(mode === CUSTOM ? `from=${range.from}&to=${range.to}` : `month=${mode}`);
        }}
      >
        <Field label="Period" className="md:w-menu">
          <Select
            value={mode}
            onValueChange={setMode}
            options={[...recentMonths(today, 13), { value: CUSTOM, label: "Choose dates" }]}
          />
        </Field>
        {mode === CUSTOM ? (
          <>
            <Field label="From">
              <DatePicker
                value={fromIsoDate(range.from)}
                onValueChange={(d) => d && setRange((r) => ({ ...r, from: toIsoDate(d) }))}
              />
            </Field>
            <Field label="To">
              <DatePicker
                value={fromIsoDate(range.to)}
                onValueChange={(d) => d && setRange((r) => ({ ...r, to: toIsoDate(d) }))}
              />
            </Field>
          </>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          className="self-start md:self-auto"
        >
          Show
        </Button>
        {report.loads ? (
          <Button onClick={exportCsv} className="self-start md:ml-auto md:self-auto">
            <Download aria-hidden />
            Export CSV
          </Button>
        ) : null}
      </form>

      <h2 className="text-lg font-semibold">{period}</h2>

      {!report.loads ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No completed loads in this period"
            description="Reports count loads once they're complete. Choose another month or dates."
          />
        </Card>
      ) : (
        <>
          <StatGroup aria-label="Period at a glance">
            <Stat label="Completed loads" value={report.loads} />
            <Stat
              label="Cost per drop"
              value={
                <Money value={costPerDrop.total.perDrop} estimate={costPerDrop.total.estimate} />
              }
            />
            <Stat
              label="Failed deliveries"
              value={`${failed.count} (${formatPercent(failed.rate)})`}
            />
            <Stat
              label="Haulier spend"
              value={
                <Money value={spend.total} estimate={spend.rows.some((r) => r.estimated > 0)} />
              }
            />
          </StatGroup>

          <Card>
            <CardHeader className="flex-col justify-start gap-1">
              <CardTitle>Cost per drop</CardTitle>
              <p className="text-sm text-text-muted">
                Own vehicles from running costs (est.); hauliers at the agreed price, or the rate
                card (est.) where none was entered.
              </p>
            </CardHeader>
            <CardContent>
              <ReportTable
                label="Cost per drop"
                headers={["Vehicle or haulier", "Loads", "Drops", "Cost", "Per drop"]}
                numeric={[1, 2, 3, 4]}
                rows={[
                  ...costPerDrop.rows.map((r) => [
                    <span key="n" className="flex flex-wrap items-center gap-2">
                      {r.name}
                      {r.kind === "haulier" ? <Badge>Haulier</Badge> : null}
                      {r.unpriced ? (
                        <Badge tone="warning">{plural(r.unpriced, "load")} unpriced</Badge>
                      ) : null}
                    </span>,
                    r.loads,
                    r.drops,
                    <Money key="c" value={r.cost} estimate={r.estimate} />,
                    <Money key="p" value={r.perDrop} estimate={r.estimate} />,
                  ]),
                  [
                    <span key="t" className="font-semibold">
                      All loads
                    </span>,
                    costPerDrop.total.loads,
                    costPerDrop.total.drops,
                    <Money
                      key="c"
                      value={costPerDrop.total.cost}
                      estimate={costPerDrop.total.estimate}
                    />,
                    <Money
                      key="p"
                      value={costPerDrop.total.perDrop}
                      estimate={costPerDrop.total.estimate}
                    />,
                  ],
                ]}
              />
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-col justify-start gap-1">
                <CardTitle>Vehicle fill</CardTitle>
                <p className="text-sm text-text-muted">
                  Per load, whichever of space and weight was closer to the limit.
                </p>
              </CardHeader>
              <CardContent>
                {fill.length ? (
                  <ReportTable
                    label="Vehicle fill"
                    headers={["Vehicle", "Loads", "Average", "Lowest", "Highest"]}
                    numeric={[1, 2, 3, 4]}
                    rows={fill.map((r) => [
                      r.name,
                      r.loads,
                      formatPercent(r.average),
                      formatPercent(r.lowest),
                      formatPercent(r.highest),
                    ])}
                  />
                ) : (
                  <p className="text-sm text-text-muted">No own-vehicle loads in this period.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-col justify-start gap-1">
                <CardTitle>Failed deliveries by reason</CardTitle>
                <p className="text-sm text-text-muted">
                  {plural(failed.count, "failed drop")} out of {plural(failed.drops, "drop")} (
                  {formatPercent(failed.rate)}).
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {failed.byReason.length ? (
                  <>
                    <ReportTable
                      label="Failed deliveries by reason"
                      headers={["Reason", "Failed drops"]}
                      numeric={[1]}
                      rows={failed.byReason.map((r) => [r.label, r.count])}
                    />
                    <ul
                      aria-label="Failed drops"
                      className="flex flex-col gap-1 text-xs text-text-muted"
                    >
                      {failed.list.map((f, i) => (
                        <li key={i} className="break-words">
                          {formatIsoDate(f.date)} · {f.load} · {f.siteName}
                          {f.orderRefs.length ? ` (${f.orderRefs.join(", ")})` : ""}: {f.label}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-success-fg">No failed deliveries in this period.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Haulier spend by month</CardTitle>
            </CardHeader>
            <CardContent>
              {spend.rows.length ? (
                <ReportTable
                  label="Haulier spend by month"
                  headers={["Month", "Haulier", "Loads", "Agreed", "Estimated", "Total"]}
                  numeric={[2, 3, 4, 5]}
                  rows={[
                    ...spend.rows.map((r) => [
                      monthLabel(r.month),
                      <span key="h" className="flex flex-wrap items-center gap-2">
                        {r.haulier}
                        {r.unpriced ? (
                          <Badge tone="warning">{plural(r.unpriced, "load")} unpriced</Badge>
                        ) : null}
                      </span>,
                      r.loads,
                      <Money key="a" value={r.agreed} />,
                      <Money key="e" value={r.estimated} estimate={r.estimated > 0} />,
                      <Money key="t" value={r.total} estimate={r.estimated > 0} />,
                    ]),
                    ...spend.months.map((m) => [
                      <span key="m" className="font-semibold">
                        {monthLabel(m.month)} total
                      </span>,
                      "",
                      "",
                      "",
                      "",
                      <span key="t" className="num font-semibold">
                        {formatGbp(m.total)}
                      </span>,
                    ]),
                  ]}
                />
              ) : (
                <p className="text-sm text-text-muted">No haulier loads in this period.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
