/**
 * History search filters (spec 9.6), kept in the URL so a search can be
 * shared or bookmarked. A month ("2026-10") is the quick way to say a date
 * range: "what did we send [customer] in [month]?" is one search.
 */

export type HistoryFilters = {
  q: string;
  customer: string | null;
  site: string | null;
  month: string | null;
  from: string | null;
  to: string | null;
  vehicle: string | null;
  driver: string | null;
  haulier: string | null;
};

export const EMPTY_FILTERS: HistoryFilters = {
  q: "",
  customer: null,
  site: null,
  month: null,
  from: null,
  to: null,
  vehicle: null,
  driver: null,
  haulier: null,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const id = (v: string | string[] | undefined) => (UUID.test(one(v)) ? one(v) : null);
const date = (v: string | string[] | undefined) => (ISO.test(one(v)) ? one(v) : null);

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): HistoryFilters {
  return {
    q: one(params.q).trim().slice(0, 100),
    customer: id(params.customer),
    site: id(params.site),
    month: MONTH.test(one(params.month)) ? one(params.month) : null,
    from: date(params.from),
    to: date(params.to),
    vehicle: id(params.vehicle),
    driver: id(params.driver),
    haulier: id(params.haulier),
  };
}

/** First and last day of a "yyyy-mm" month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** The date range a search covers: a month wins over separate from/to dates. */
export function dateRange(f: HistoryFilters): { from: string | null; to: string | null } {
  if (f.month) return monthRange(f.month);
  if (f.from && f.to && f.from > f.to) return { from: f.to, to: f.from };
  return { from: f.from, to: f.to };
}

export const hasFilters = (f: HistoryFilters) =>
  Boolean(
    f.q || f.customer || f.site || f.month || f.from || f.to || f.vehicle || f.driver || f.haulier,
  );

export function toSearchParams(f: HistoryFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  return p.toString();
}

/** The last 24 months, newest first, for the month picker. */
export function recentMonths(today: string, count = 24): { value: string; label: string }[] {
  const [y, m] = today.split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
    out.push({ value, label });
  }
  return out;
}

/** Totals by unit type across the results: "14 Door pack · 6 Euro pallet". */
export function unitTotals(
  lines: { unit: string; quantity: number }[],
): { unit: string; quantity: number }[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.unit, (m.get(l.unit) ?? 0) + l.quantity);
  return [...m]
    .map(([unit, quantity]) => ({ unit, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}
