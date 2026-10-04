import "server-only";
import { londonToday } from "@/lib/format";
import { buildContext, loadMetrics } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import { loadTitle } from "@/lib/planning/labels";
import { deliveryOptions } from "@/lib/suggestions/options";
import { createClient } from "@/lib/supabase/server";
import { buildReport, type Report, type ReportLoad } from "./compute";

/** Reports over completed loads between two dates (inclusive). */
export async function loadReport(from: string, to: string): Promise<Report> {
  const data = await loadPlanData(from, to);
  const done = data.loads.filter((l) => l.status === "complete");
  const stopIds = done.flatMap((l) => l.stops.map((s) => s.id));
  const supabase = await createClient();
  const { data: failedPods } = stopIds.length
    ? await supabase
        .from("pods")
        .select("stop_id, failure_reason")
        .eq("outcome", "failed")
        .in("stop_id", stopIds)
    : { data: [] };
  const failedByStop = new Map((failedPods ?? []).map((p) => [p.stop_id, p.failure_reason]));
  const clock = { now: new Date(), today: londonToday() };

  const loads: ReportLoad[] = done.map((load) => {
    const ctx = buildContext(load, data, clock);
    const metrics = loadMetrics(ctx, data);
    const { title } = loadTitle(load, data);
    const own = Boolean(load.vehicle_id);
    let cost: number | null = null;
    let costSource: ReportLoad["costSource"] = null;
    if (own) {
      cost = metrics.costEstimate;
      costSource = cost == null ? null : "running costs";
    } else if (load.haulier_id) {
      if (load.agreed_price != null) {
        cost = load.agreed_price;
        costSource = "agreed";
      } else {
        const option = deliveryOptions(ctx, data).find(
          (o) => o.kind === "haulier" && o.id === load.haulier_id,
        );
        cost = option?.cost ?? null;
        costSource = cost == null ? null : "rate card";
      }
    }
    const weightShare = metrics.payloadKg ? metrics.weightKg / metrics.payloadKg : 0;
    return {
      id: load.id,
      date: load.load_date,
      kind: own ? "own" : "haulier",
      name: title,
      cost: cost == null ? null : Math.round(cost * 100) / 100,
      costSource,
      drops: load.stops.length,
      fill: own && metrics.space ? Math.max(metrics.space.share, weightShare) : null,
      failed: load.stops
        .filter((s) => s.status === "failed")
        .map((s) => ({
          reason: failedByStop.get(s.id) ?? null,
          siteName: data.sites[s.site_id]?.name ?? "Site",
          orderRefs: s.order_ids.map((id) => data.orders[id]?.order_ref ?? "").filter(Boolean),
        })),
    };
  });
  return buildReport(loads);
}
