import "server-only";
import { londonToday } from "@/lib/format";
import { buildContext } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import type { PlanData, PlanLoad } from "@/lib/planning/types";
import { crowMiles } from "@/lib/routing/legs";
import { matrixLegs, routeLegs } from "@/lib/routing/server";
import { MAX_MATRIX_POINTS } from "@/lib/services/routing";
import { createClient } from "@/lib/supabase/server";
import { assetCollections, type CollectionSuggestion } from "./collections";
import { fillGaps, type GapFill } from "./fill-gaps";
import { standingRunOrders, type StandingRunSuggestion } from "./standing-run";
import { deliveryOptions, type DeliveryOption } from "./options";
import { suggestStopOrder, type StopOrderSuggestion } from "./stop-order";
import { suggestLoads, type SuggestResult } from "./suggest-loads";

const clock = () => ({ now: new Date(), today: londonToday() });
const located = (p: { latitude: number | null; longitude: number | null }) =>
  p.latitude != null && p.longitude != null;

/** Proposed loads for the given days (spec 8.1), using road distances where available. */
export async function proposeLoads(
  from: string,
  to: string,
  days: string[],
): Promise<SuggestResult> {
  const data = await loadPlanData(from, to);
  const depot = data.depots.find((d) => d.is_default) ?? data.depots[0];
  const sites = [...new Set(data.pool.map((id) => data.orders[id]?.site_id))]
    .map((id) => data.sites[id])
    .filter((s) => s && located(s));
  const points = depot ? [depot, ...sites].slice(0, MAX_MATRIX_POINTS) : [];
  const legs = await matrixLegs(points);
  const open = days.filter((d) => d >= londonToday());
  return suggestLoads({ ...data, legs: { ...data.legs, ...legs } }, open, clock());
}

export type LoadAdvice = {
  options: DeliveryOption[];
  stopOrder: StopOrderSuggestion | null;
  gaps: GapFill[];
  collections: CollectionSuggestion[];
  standing: StandingRunSuggestion | null;
};

/** Orders a standing-run load could carry (spec 6.12). */
async function standingFor(load: PlanLoad): Promise<StandingRunSuggestion | null> {
  if (!load.standing_run_id) return null;
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("standing_runs")
    .select("name, cutoff_time, sites:standing_run_sites(site_id, position)")
    .eq("id", load.standing_run_id)
    .maybeSingle();
  if (!run) return null;
  const siteIds = [...((run.sites ?? []) as { site_id: string; position: number }[])]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.site_id);
  const { data: orders } = siteIds.length
    ? await supabase
        .from("orders")
        .select(
          "id, order_ref, site_id, required_date, created_at, customer:customers(name), site:sites(name)",
        )
        .eq("status", "unplanned")
        .in("site_id", siteIds)
        .limit(200)
    : { data: [] };
  return standingRunOrders(
    { name: run.name, cutoff: String(run.cutoff_time).slice(0, 5), siteIds },
    load.load_date,
    (orders ?? []).map((o) => ({
      id: o.id,
      order_ref: o.order_ref,
      site_id: o.site_id,
      required_date: o.required_date,
      created_at: o.created_at,
      customer_name: (o.customer as unknown as { name: string } | null)?.name ?? "",
      site_name: (o.site as unknown as { name: string } | null)?.name ?? "Site",
    })),
  );
}

/** Cheapest valid option, a better drop order and orders to fill the gaps, for one load. */
export async function adviseLoad(loadId: string, loadDate: string): Promise<LoadAdvice | null> {
  const data = await loadPlanData(loadDate, loadDate);
  const load = data.loads.find((l) => l.id === loadId);
  if (!load) return null;
  const base = buildContext(load, data, clock());
  const route = [base.load.depot, ...base.stops.map((s) => s.site)];
  const maxMiles = data.thresholds.fill_gaps_miles;
  // Only orders roughly near the route are worth asking the routing provider about.
  const candidates = data.pool
    .map((id) => data.orders[id])
    .filter((o) => o && data.sites[o.site_id])
    .map((o) => ({ ...o, site: data.sites[o.site_id] }))
    .filter(
      (o) => Math.min(...route.map((p) => crowMiles(p, o.site) ?? Infinity)) <= maxMiles * 1.5,
    );
  // Sites holding overdue returnable assets near the route (spec 8.5).
  const collectMiles = data.thresholds.asset_collection_miles;
  const assetSites = [
    ...new Set(
      data.assets
        .filter((a) => a.status === "at_customer" && a.expected_return_date && a.site_id)
        .map((a) => a.site_id!),
    ),
  ]
    .map((id) => data.sites[id])
    .filter(
      (s) => s && Math.min(...route.map((p) => crowMiles(p, s) ?? Infinity)) <= collectMiles * 1.5,
    );
  const points = [...route, ...candidates.map((c) => c.site), ...assetSites]
    .filter(located)
    .slice(0, MAX_MATRIX_POINTS);
  const legs = await matrixLegs(points);
  const withLegs: PlanData = { ...data, legs: { ...data.legs, ...legs } };
  const ctx = buildContext(load, withLegs, clock());
  const vehicle = data.vehicles.find((v) => v.id === load.vehicle_id) ?? null;
  // Assets already planned for collection on any load, not just this day's.
  const { data: planned } = await (
    await createClient()
  )
    .from("stop_assets")
    .select("asset_id")
    .eq("direction", "collect")
    .eq("outcome", "pending");
  return {
    options: deliveryOptions(ctx, withLegs),
    stopOrder: suggestStopOrder(ctx),
    gaps: fillGaps(ctx, candidates, vehicle, maxMiles),
    collections: assetCollections(
      ctx,
      data.assets,
      data.sites,
      collectMiles,
      new Set((planned ?? []).map((p) => p.asset_id as string)),
    ),
    standing: await standingFor(load),
  };
}

/** Every way to deliver one unplanned order on its own, for comparing before planning. */
export async function adviseOrder(
  orderId: string,
  requiredDate: string,
): Promise<{ date: string; options: DeliveryOption[] } | null> {
  const today = londonToday();
  const date = requiredDate < today ? today : requiredDate;
  const data = await loadPlanData(date, date);
  const order = data.orders[orderId];
  const depot = data.depots.find((d) => d.is_default) ?? data.depots[0];
  if (!order || !depot) return null;
  const site = data.sites[order.site_id];
  const load: PlanLoad = {
    id: "compare",
    load_date: date,
    depot_id: depot.id,
    vehicle_id: null,
    haulier_id: null,
    crew_size: 1,
    start_time: "07:30",
    status: "draft",
    notes: "",
    driver_ids: [],
    standing_run_id: null,
    agreed_price: null,
    stops: [
      {
        id: "compare-stop",
        sequence: 1,
        site_id: order.site_id,
        eta_from: null,
        eta_to: null,
        booking_ref: "",
        booking_slot: null,
        status: "pending",
        confirmed: false,
        confirmed_by: "",
        confirmation_method: null,
        confirmed_at: null,
        confirmation_note: "",
        order_ids: [orderId],
        assets: [],
      },
    ],
  };
  const legs = site ? await routeLegs([[depot, site, depot]]) : {};
  const withLegs: PlanData = { ...data, legs: { ...data.legs, ...legs } };
  return { date, options: deliveryOptions(buildContext(load, withLegs, clock()), withLegs) };
}
