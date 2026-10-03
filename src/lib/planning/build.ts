import { estimateRun, type RunEstimate } from "@/lib/rules/estimate";
import { spaceUse, totalWeight, type SpaceUse } from "@/lib/rules/capacity";
import type { RuleContext, RuleStop } from "@/lib/rules/context";
import { runChecks, withDecisions, type DecidedWarning } from "@/lib/rules";
import type { PlanData, PlanLoad } from "./types";

/**
 * Turns a load on the board into the rules engine's context. `extraOrderIds`
 * adds orders as if dropped on (for the live capacity preview while dragging).
 */
export function buildContext(
  load: PlanLoad,
  data: PlanData,
  clock: { now: Date; today: string },
  extraOrderIds: string[] = [],
): RuleContext {
  const stops: RuleStop[] = load.stops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      site: data.sites[s.site_id],
      orders: s.order_ids.map((id) => data.orders[id]).filter(Boolean),
      eta_from: s.eta_from,
      eta_to: s.eta_to,
      booking_ref: s.booking_ref,
      booking_slot: s.booking_slot,
      confirmed: s.confirmed,
    }))
    .filter((s) => s.site);

  for (const id of extraOrderIds) {
    const order = data.orders[id];
    if (!order || stops.some((s) => s.orders.some((o) => o.id === id))) continue;
    const existing = stops.find((s) => s.site.id === order.site_id);
    if (existing) existing.orders = [...existing.orders, order];
    else if (data.sites[order.site_id]) {
      stops.push({
        id: `preview-${id}`,
        sequence: stops.length + 1,
        site: data.sites[order.site_id],
        orders: [order],
        eta_from: null,
        eta_to: null,
        booking_ref: "",
        booking_slot: null,
        confirmed: false,
      });
    }
  }

  const depot = data.depots.find((d) => d.id === load.depot_id) ?? {
    id: load.depot_id,
    name: "Depot",
    latitude: null,
    longitude: null,
  };
  const vehicle = data.vehicles.find((v) => v.id === load.vehicle_id) ?? null;
  const haulier = data.hauliers.find((h) => h.id === load.haulier_id) ?? null;
  return {
    load: {
      id: load.id,
      load_date: load.load_date,
      start_time: load.start_time,
      crew_size: load.crew_size,
      status: load.status,
      vehicle,
      haulier: haulier ? { id: haulier.id, name: haulier.name } : null,
      depot,
    },
    stops,
    unitTypes: data.unitTypes,
    vehicles: data.vehicles,
    busyVehicleIds: data.loads
      .filter((l) => l.id !== load.id && l.load_date === load.load_date && l.vehicle_id)
      .map((l) => l.vehicle_id!),
    thresholds: data.thresholds,
    staleDays: data.staleDays,
    zones: data.zones,
    assets: [],
    now: clock.now,
    today: clock.today,
  };
}

export type LoadMetrics = {
  space: SpaceUse | null;
  weightKg: number;
  payloadKg: number | null;
  run: RunEstimate;
  /** Own vehicle only: miles × £/mile + duty hours × £/driver hour. An estimate. */
  costEstimate: number | null;
  units: number;
};

export function loadMetrics(ctx: RuleContext, data: PlanData): LoadMetrics {
  const lines = ctx.stops.flatMap((s) => s.orders.flatMap((o) => o.lines));
  const vehicle = data.vehicles.find((v) => v.id === ctx.load.vehicle?.id) ?? null;
  const run = estimateRun(ctx);
  const costEstimate =
    vehicle && run.miles != null && run.dutyHours != null
      ? run.miles * vehicle.cost_per_mile + run.dutyHours * vehicle.cost_per_driver_hour
      : null;
  return {
    space: vehicle
      ? spaceUse(
          lines.map((l) => ({ ...l, unit: ctx.unitTypes[l.unit_type_id] })),
          vehicle,
        )
      : null,
    weightKg: totalWeight(lines),
    payloadKg: vehicle?.payload_kg ?? null,
    run,
    costEstimate,
    units: lines.reduce((n, l) => n + l.quantity, 0),
  };
}

/** Live warnings for a load with the planner's decisions attached. */
export function loadWarnings(ctx: RuleContext, data: PlanData): DecidedWarning[] {
  const decisions = Object.fromEntries(
    data.decisions.filter((d) => d.load_id === ctx.load.id).map((d) => [d.key, d]),
  );
  return withDecisions(runChecks(ctx), decisions);
}
