import { formatIsoDate } from "@/lib/format";
import { buildContext, loadMetrics } from "@/lib/planning/build";
import type { PlanData, PlanLoad, PlanOrder, PlanVehicle } from "@/lib/planning/types";
import { runChecks } from "@/lib/rules";
import { legBetween } from "@/lib/routing/legs";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import { nearestNeighbour, untangle } from "./stop-order";

/**
 * Suggested loads (spec 8.1, v1 method): give each ready order a day in its
 * window, cluster each day's orders by distance from each other and the
 * depot, fill vehicles up to capacity and let the rules engine reject
 * anything that would block. The planner accepts, edits or dismisses each.
 */

export type LoadProposal = {
  key: string;
  date: string;
  depotId: string;
  vehicleId: string;
  /** In suggested drop order. */
  orderIds: string[];
  /** e.g. "3 drops · 12 miles spread · 18 tonne · 14/16 EUR · no blocking warnings" */
  summary: string;
  reasons: string[];
  checks: number;
};

export type Unplaced = { orderId: string; orderRef: string; reason: string };
export type SuggestResult = { proposals: LoadProposal[]; unplaced: Unplaced[] };

/** Blocking warnings a new load can't avoid yet (there's no booking ref until it's booked). */
const IGNORED_FOR_SUGGESTIONS = new Set(["BOOKING_MISSING"]);

export const MAX_SPREAD_MILES = 25;

const readyBy = (o: PlanOrder, day: string) =>
  o.readiness === "ready" || Boolean(o.expected_ready_date && o.expected_ready_date <= day);

/** The day an order should go: its required date if it can, else the latest day it can go on time. */
export function dayFor(
  o: PlanOrder,
  days: string[],
  today: string,
): { day: string | null; reason?: string } {
  const open = days.filter((d) => d >= today);
  const deadline = o.latest_date ?? o.required_date;
  const onTime = open.filter(
    (d) => (!o.earliest_date || d >= o.earliest_date) && d <= deadline && readyBy(o, d),
  );
  if (onTime.includes(o.required_date)) return { day: o.required_date };
  if (onTime.length) return { day: onTime[onTime.length - 1] };
  const ready = open.filter((d) => readyBy(o, d) && (!o.earliest_date || d >= o.earliest_date));
  // Already overdue: the first day it can go, and the late warning will say so.
  if (deadline < (open[0] ?? today) && ready.length) return { day: ready[0] };
  if (!open.some((d) => readyBy(o, d))) {
    return {
      day: null,
      reason: o.expected_ready_date
        ? `Not ready until ${formatIsoDate(o.expected_ready_date)}`
        : "Not ready and no expected ready date",
    };
  }
  if (ready.length && ready[0] > deadline) {
    return {
      day: null,
      reason: `Not ready until ${formatIsoDate(o.expected_ready_date ?? ready[0])}, after it's needed on ${formatIsoDate(deadline)}`,
    };
  }
  return { day: null, reason: `Needed ${formatIsoDate(o.required_date)}, outside these days` };
}

function draftLoad(
  key: string,
  date: string,
  depotId: string,
  vehicle: PlanVehicle,
  orders: PlanOrder[],
): PlanLoad {
  const bySite = new Map<string, string[]>();
  for (const o of orders) bySite.set(o.site_id, [...(bySite.get(o.site_id) ?? []), o.id]);
  return {
    id: key,
    load_date: date,
    depot_id: depotId,
    vehicle_id: vehicle.id,
    haulier_id: null,
    crew_size: vehicle.crew_size_default,
    start_time: "07:30",
    status: "draft",
    notes: "",
    driver_ids: [],
    standing_run_id: null,
    stops: [...bySite].map(([siteId, ids], i) => ({
      id: `${key}-stop-${i}`,
      sequence: i + 1,
      site_id: siteId,
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
      order_ids: ids,
      assets: [],
    })),
  };
}

export function suggestLoads(
  data: PlanData,
  days: string[],
  clock: { now: Date; today: string },
  maxSpread = MAX_SPREAD_MILES,
): SuggestResult {
  const depot = data.depots.find((d) => d.is_default) ?? data.depots[0];
  const unplaced: Unplaced[] = [];
  const proposals: LoadProposal[] = [];
  if (!depot) return { proposals, unplaced };
  const busy = new Set(
    data.loads.filter((l) => l.vehicle_id).map((l) => `${l.load_date}|${l.vehicle_id}`),
  );
  const miles = (a: { latitude: number | null; longitude: number | null }, b: typeof a) =>
    legBetween(data.legs, a, b)?.miles ?? Infinity;

  const byDay = new Map<string, PlanOrder[]>();
  for (const id of data.pool) {
    const o = data.orders[id];
    if (!o || !data.sites[o.site_id]) continue;
    const { day, reason } = dayFor(o, days, clock.today);
    if (day) byDay.set(day, [...(byDay.get(day) ?? []), o]);
    else unplaced.push({ orderId: o.id, orderRef: o.order_ref, reason: reason! });
  }

  const blocking = (load: PlanLoad) =>
    runChecks(buildContext(load, data, clock)).filter(
      (w) => w.severity === "blocking" && !IGNORED_FOR_SUGGESTIONS.has(w.code),
    );

  for (const day of days.filter((d) => byDay.has(d))) {
    const site = (o: PlanOrder) => data.sites[o.site_id];
    // Furthest from the depot first: those are the hardest to fit in later.
    const pool = byDay.get(day)!.sort((a, b) => miles(depot, site(b)) - miles(depot, site(a)));
    while (pool.length) {
      const free = data.vehicles
        .filter(
          (v) =>
            v.active &&
            !busy.has(`${day}|${v.id}`) &&
            !(
              v.off_road_from &&
              v.off_road_from <= day &&
              (!v.off_road_until || v.off_road_until >= day)
            ),
        )
        .sort((a, b) => b.payload_kg - a.payload_kg);
      if (!free.length) {
        for (const o of pool)
          unplaced.push({
            orderId: o.id,
            orderRef: o.order_ref,
            reason: `No vehicle free on ${formatIsoDate(day)}`,
          });
        break;
      }
      const seed = pool.shift()!;
      const key = `proposal-${proposals.length + 1}`;
      const fitsSeed = free.find((v) => !blocking(draftLoad(key, day, depot.id, v, [seed])).length);
      if (!fitsSeed) {
        const reason = blocking(draftLoad(key, day, depot.id, free[0], [seed]))[0];
        unplaced.push({
          orderId: seed.id,
          orderRef: seed.order_ref,
          reason: reason ? reason.title : "No vehicle can take it",
        });
        continue;
      }
      // Grow the cluster with the nearest orders, as long as nothing blocks.
      let cluster = [seed];
      let vehicle = fitsSeed;
      const nearest = () =>
        [...pool].sort(
          (a, b) =>
            Math.min(...cluster.map((c) => miles(site(c), site(a)))) -
            Math.min(...cluster.map((c) => miles(site(c), site(b)))),
        );
      for (const candidate of nearest()) {
        if (Math.min(...cluster.map((c) => miles(site(c), site(candidate)))) > maxSpread) break;
        const next = [...cluster, candidate];
        const fits = free.find(
          (v) =>
            v.payload_kg >= vehicle.payload_kg &&
            !blocking(draftLoad(key, day, depot.id, v, next)).length,
        );
        if (fits) {
          cluster = next;
          vehicle = fits;
          pool.splice(pool.indexOf(candidate), 1);
        }
      }
      // The smallest free vehicle that still takes them all.
      const smallest =
        [...free]
          .reverse()
          .find((v) => !blocking(draftLoad(key, day, depot.id, v, cluster)).length) ?? vehicle;
      busy.add(`${day}|${smallest.id}`);

      let load = draftLoad(key, day, depot.id, smallest, cluster);
      const ctx = buildContext(load, data, clock);
      const ordered = untangle(ctx, nearestNeighbour(ctx, ctx.stops));
      load = {
        ...load,
        stops: ordered.map((s, i) => ({
          ...load.stops.find((x) => x.id === s.id)!,
          sequence: i + 1,
        })),
      };
      const finalCtx = buildContext(load, data, clock);
      const metrics = loadMetrics(finalCtx, data);
      const warnings = runChecks(finalCtx);
      const checks = warnings.filter((w) => w.severity === "check").length;
      const drops = load.stops.length;
      const sites = load.stops.map((s) => data.sites[s.site_id]);
      const spread = Math.max(
        0,
        ...sites.flatMap((a) => sites.map((b) => (a === b ? 0 : miles(a, b)))),
      );
      const furthest = Math.max(...sites.map((s) => miles(depot, s)));
      const space = metrics.space?.units
        ? `${metrics.space.units.used}/${metrics.space.units.max} ${metrics.space.units.code}`
        : `${Math.round((metrics.space?.share ?? 0) * 100)}% of space`;
      const required = [...new Set(cluster.map((o) => o.required_date))].sort();

      const reasons = [
        required.length === 1 && required[0] === day
          ? `All due ${formatIsoDate(day)}.`
          : `Due ${required.map(formatIsoDate).join(", ")}; all can go ${formatIsoDate(day)}.`,
        drops > 1
          ? `Grouped because the drops are within ${spread.toFixed(0)} miles of each other, furthest ${furthest.toFixed(0)} miles from ${depot.name}.`
          : `${furthest.toFixed(0)} miles from ${depot.name}.`,
        `${smallest.name} is the smallest free vehicle that takes ${cluster.length === 1 ? "it" : "them all"} without a blocking warning.`,
        ...(drops > 1
          ? [`Drop order: nearest stop each time from ${depot.name}, without doubling back.`]
          : []),
        ...(metrics.run.roadDistances ? [] : ["Distances are estimates (straight line × 1.3)."]),
      ];
      proposals.push({
        key,
        date: day,
        depotId: depot.id,
        vehicleId: smallest.id,
        orderIds: load.stops.flatMap((s) => s.order_ids),
        summary: [
          `${drops} ${drops === 1 ? "drop" : "drops"}`,
          ...(drops > 1
            ? [`${spread.toFixed(0)} miles spread`]
            : [`${furthest.toFixed(0)} miles from ${depot.name}`]),
          labelFor(VEHICLE_TYPES, smallest.vehicle_type),
          space,
          "no blocking warnings",
          ...(checks ? [`${checks} ${checks === 1 ? "check" : "checks"}`] : []),
        ].join(" · "),
        reasons,
        checks,
      });
    }
  }
  return { proposals, unplaced };
}
