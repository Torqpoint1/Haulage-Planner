import "server-only";
import { londonToday } from "@/lib/format";
import { buildContext } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import type { PlanData, PlanLoad } from "@/lib/planning/types";
import { crowMiles } from "@/lib/routing/legs";
import { matrixLegs, routeLegs } from "@/lib/routing/server";
import { MAX_MATRIX_POINTS } from "@/lib/services/routing";
import { fillGaps, type GapFill } from "./fill-gaps";
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
};

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
  const points = [...route, ...candidates.map((c) => c.site)]
    .filter(located)
    .slice(0, MAX_MATRIX_POINTS);
  const legs = await matrixLegs(points);
  const withLegs: PlanData = { ...data, legs: { ...data.legs, ...legs } };
  const ctx = buildContext(load, withLegs, clock());
  const vehicle = data.vehicles.find((v) => v.id === load.vehicle_id) ?? null;
  return {
    options: deliveryOptions(ctx, withLegs),
    stopOrder: suggestStopOrder(ctx),
    gaps: fillGaps(ctx, candidates, vehicle, maxMiles),
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
      },
    ],
  };
  const legs = site ? await routeLegs([[depot, site, depot]]) : {};
  const withLegs: PlanData = { ...data, legs: { ...data.legs, ...legs } };
  return { date, options: deliveryOptions(buildContext(load, withLegs, clock()), withLegs) };
}
