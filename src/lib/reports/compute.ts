import { FAILURE_REASONS } from "@/lib/drivers/types";

/**
 * Basic reports (spec stage 10): cost per drop, vehicle fill %, failed
 * deliveries by reason and haulier spend by month, over completed loads.
 * Pure: the server gathers each load's figures, this adds them up.
 */

export type CostSource = "running costs" | "agreed" | "rate card";

export type ReportLoad = {
  id: string;
  date: string;
  kind: "own" | "haulier";
  /** Vehicle or haulier name. */
  name: string;
  /** Null when there's no way to price it (e.g. no rate card covers it). */
  cost: number | null;
  costSource: CostSource | null;
  /** Stops attempted on the load. */
  drops: number;
  /** Own vehicles: the higher of space and weight used, 1 = full. */
  fill: number | null;
  failed: { reason: string | null; siteName: string; orderRefs: string[] }[];
};

export type CostRow = {
  name: string;
  kind: "own" | "haulier";
  loads: number;
  drops: number;
  cost: number;
  /** Cost of priced loads ÷ their drops. */
  perDrop: number | null;
  /** Any part of the cost is an estimate (running costs or a rate card). */
  estimate: boolean;
  /** Loads with no price, left out of the cost. */
  unpriced: number;
};

export type FillRow = {
  name: string;
  loads: number;
  average: number;
  lowest: number;
  highest: number;
};

export type FailedReason = { reason: string; label: string; count: number };

export type SpendRow = {
  month: string;
  haulier: string;
  loads: number;
  agreed: number;
  estimated: number;
  total: number;
  unpriced: number;
};

export type Report = {
  loads: number;
  costPerDrop: { rows: CostRow[]; total: CostRow };
  fill: FillRow[];
  failed: {
    count: number;
    drops: number;
    /** Share of drops that failed. */
    rate: number;
    byReason: FailedReason[];
    list: { date: string; load: string; siteName: string; orderRefs: string[]; label: string }[];
  };
  spend: { rows: SpendRow[]; months: { month: string; total: number }[]; total: number };
};

const pence = (n: number) => Math.round(n * 100) / 100;
const reasonLabel = (r: string | null) =>
  FAILURE_REASONS.find((x) => x.value === r)?.label ?? "No reason given";

function costRow(name: string, kind: "own" | "haulier", loads: ReportLoad[]): CostRow {
  const priced = loads.filter((l) => l.cost != null);
  const cost = pence(priced.reduce((n, l) => n + (l.cost ?? 0), 0));
  const pricedDrops = priced.reduce((n, l) => n + l.drops, 0);
  return {
    name,
    kind,
    loads: loads.length,
    drops: loads.reduce((n, l) => n + l.drops, 0),
    cost,
    perDrop: pricedDrops ? pence(cost / pricedDrops) : null,
    estimate: priced.some((l) => l.costSource !== "agreed"),
    unpriced: loads.length - priced.length,
  };
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

export function buildReport(loads: ReportLoad[]): Report {
  const byName = groupBy(loads, (l) => `${l.kind}:${l.name}`);
  const rows = [...byName.values()]
    .map((ls) => costRow(ls[0].name, ls[0].kind, ls))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "own" ? -1 : 1));

  const fill: FillRow[] = [
    ...groupBy(
      loads.filter((l) => l.kind === "own" && l.fill != null),
      (l) => l.name,
    ),
  ]
    .map(([name, ls]) => {
      const values = ls.map((l) => l.fill!);
      return {
        name,
        loads: ls.length,
        average: values.reduce((n, v) => n + v, 0) / values.length,
        lowest: Math.min(...values),
        highest: Math.max(...values),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const failures = loads.flatMap((l) =>
    l.failed.map((f) => ({ ...f, date: l.date, load: l.name, label: reasonLabel(f.reason) })),
  );
  const drops = loads.reduce((n, l) => n + l.drops, 0);
  const byReason = [...groupBy(failures, (f) => f.reason ?? "none")]
    .map(([reason, fs]) => ({ reason, label: fs[0].label, count: fs.length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const haulierLoads = loads.filter((l) => l.kind === "haulier");
  const spendRows: SpendRow[] = [...groupBy(haulierLoads, (l) => `${l.date.slice(0, 7)}|${l.name}`)]
    .map(([key, ls]) => {
      const [month, haulier] = key.split("|");
      const agreed = pence(
        ls.filter((l) => l.costSource === "agreed").reduce((n, l) => n + (l.cost ?? 0), 0),
      );
      const estimated = pence(
        ls.filter((l) => l.costSource === "rate card").reduce((n, l) => n + (l.cost ?? 0), 0),
      );
      return {
        month,
        haulier,
        loads: ls.length,
        agreed,
        estimated,
        total: pence(agreed + estimated),
        unpriced: ls.filter((l) => l.cost == null).length,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.haulier.localeCompare(b.haulier));
  const months = [...groupBy(spendRows, (r) => r.month)].map(([month, rs]) => ({
    month,
    total: pence(rs.reduce((n, r) => n + r.total, 0)),
  }));

  return {
    loads: loads.length,
    costPerDrop: { rows, total: costRow("All loads", "own", loads) },
    fill,
    failed: {
      count: failures.length,
      drops,
      rate: drops ? failures.length / drops : 0,
      byReason,
      list: failures
        .map(({ date, load, siteName, orderRefs, label }) => ({
          date,
          load,
          siteName,
          orderRefs,
          label,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    },
    spend: { rows: spendRows, months, total: pence(months.reduce((n, m) => n + m.total, 0)) },
  };
}
