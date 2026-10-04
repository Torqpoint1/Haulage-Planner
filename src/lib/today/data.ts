import "server-only";
import { addWorkingDays } from "@/lib/today/days";
import { buildContext, loadMetrics, loadWarnings, type LoadMetrics } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import { driverNames, loadTitle } from "@/lib/planning/labels";
import type { LoadStatus } from "@/lib/planning/types";
import { warningKey, type DecidedWarning } from "@/lib/rules";
import { londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  severity: "blocking" | "check";
  /** Opens the load on the plan with this warning and its fixes in view. */
  href: string;
};

export type AttentionGroup = {
  loadId: string;
  date: string;
  title: string;
  items: AttentionItem[];
};

export type TodayLoad = {
  id: string;
  title: string;
  subtitle: string;
  drivers: string;
  status: LoadStatus;
  stops: number;
  metrics: LoadMetrics;
  blocking: number;
  checks: number;
  href: string;
};

export type DueOrder = {
  id: string;
  ref: string;
  customer: string;
  requiredDate: string;
  status: string;
  readiness: string;
};

export type TodayData = {
  today: string;
  until: string;
  lookAheadDays: number;
  nearLimit: number;
  stats: { loads: number; vehiclesOut: number; drops: number; overdueAssets: number };
  blocking: AttentionGroup[];
  checks: AttentionGroup[];
  loads: TodayLoad[];
  dueOrders: DueOrder[];
};

const planHref = (date: string, loadId: string, key?: string) =>
  `/plan?week=${date}&weekend=1&load=${loadId}${key ? `&warning=${encodeURIComponent(key)}` : ""}`;

/** Everything the Today screen shows (spec 9.1). */
export async function loadToday(now = new Date()): Promise<TodayData> {
  const today = londonToday(now);
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("warning_thresholds").single();
  const thresholds = (org?.warning_thresholds ?? {}) as Record<string, number>;
  const lookAheadDays = Number(thresholds.orders_due_working_days ?? 5);
  const until = addWorkingDays(today, lookAheadDays);

  const [data, dueRes, assetsRes] = await Promise.all([
    loadPlanData(today, until),
    supabase
      .from("orders")
      .select("id, order_ref, required_date, status, readiness, customer:customers(name)")
      .lte("required_date", until)
      .not("status", "in", "(delivered,cancelled,failed)")
      .or("status.eq.unplanned,readiness.neq.ready")
      .order("required_date")
      .limit(200),
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("status", "at_customer")
      .lt("expected_return_date", today),
  ]);

  const clock = { now, today };
  const views = data.loads
    .filter((l) => l.status !== "complete")
    .map((load) => {
      const ctx = buildContext(load, data, clock);
      return { load, metrics: loadMetrics(ctx, data), warnings: loadWarnings(ctx, data) };
    })
    .sort(
      (a, b) =>
        a.load.load_date.localeCompare(b.load.load_date) ||
        a.load.start_time.localeCompare(b.load.start_time),
    );

  const live = (w: DecidedWarning) => !w.decision;
  const group = (severity: "blocking" | "check"): AttentionGroup[] =>
    views
      .map((v) => {
        const { title } = loadTitle(v.load, data);
        return {
          loadId: v.load.id,
          date: v.load.load_date,
          title,
          items: v.warnings
            .filter((w) => live(w) && w.severity === severity)
            .map((w) => {
              const key = warningKey(w);
              return {
                key,
                title: w.title,
                detail: w.detail,
                severity,
                href: planHref(v.load.load_date, v.load.id, key),
              };
            }),
        };
      })
      .filter((g) => g.items.length);

  const todays = views.filter((v) => v.load.load_date === today);
  const allToday = data.loads.filter((l) => l.load_date === today);
  return {
    today,
    until,
    lookAheadDays,
    nearLimit: data.thresholds.capacity_near_limit_pct,
    stats: {
      loads: allToday.length,
      vehiclesOut: new Set(
        allToday.filter((l) => l.status === "out").map((l) => l.vehicle_id ?? l.haulier_id ?? l.id),
      ).size,
      drops: allToday.reduce((n, l) => n + l.stops.length, 0),
      overdueAssets: assetsRes.count ?? 0,
    },
    blocking: group("blocking"),
    checks: group("check"),
    loads: todays.map((v) => {
      const { title, subtitle } = loadTitle(v.load, data);
      const liveWarnings = v.warnings.filter(live);
      return {
        id: v.load.id,
        title,
        subtitle,
        drivers: driverNames(v.load, data),
        status: v.load.status,
        stops: v.load.stops.length,
        metrics: v.metrics,
        blocking: liveWarnings.filter((w) => w.severity === "blocking").length,
        checks: liveWarnings.filter((w) => w.severity === "check").length,
        href: planHref(today, v.load.id),
      };
    }),
    dueOrders: (dueRes.data ?? []).map((o) => ({
      id: o.id,
      ref: o.order_ref,
      customer: (o.customer as unknown as { name: string } | null)?.name ?? "",
      requiredDate: o.required_date,
      status: o.status,
      readiness: o.readiness,
    })),
  };
}
