import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RuleUnitType, RuleZone } from "@/lib/rules/context";
import { resolveThresholds } from "@/lib/settings/thresholds";
import type { PlanData, PlanLoad, PlanOrder, PlanSite, PlanVehicle } from "./types";

const ORDER_COLUMNS =
  "id, order_ref, customer_id, site_id, required_date, earliest_date, latest_date, urgency, readiness, missing_items, expected_ready_date, status, customer:customers(name), lines:order_lines(unit_type_id, quantity, weight_per_unit_kg, description, position)";

/** Postgres "07:30:00" → "07:30". */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const num = (v: unknown) => (v == null ? null : Number(v));

type OrderRow = {
  id: string;
  order_ref: string;
  customer_id: string;
  site_id: string;
  required_date: string;
  earliest_date: string | null;
  latest_date: string | null;
  urgency: PlanOrder["urgency"];
  readiness: PlanOrder["readiness"];
  missing_items: string;
  expected_ready_date: string | null;
  status: string;
  customer: { name: string } | null;
  lines: {
    unit_type_id: string;
    quantity: number;
    weight_per_unit_kg: number;
    description: string;
    position: number;
  }[];
};

const toOrder = (o: OrderRow): PlanOrder => ({
  id: o.id,
  order_ref: o.order_ref,
  customer_id: o.customer_id,
  customer_name: o.customer?.name ?? "",
  site_id: o.site_id,
  required_date: o.required_date,
  earliest_date: o.earliest_date,
  latest_date: o.latest_date,
  urgency: o.urgency,
  readiness: o.readiness,
  missing_items: o.missing_items,
  expected_ready_date: o.expected_ready_date,
  status: o.status,
  lines: [...o.lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      unit_type_id: l.unit_type_id,
      quantity: l.quantity,
      weight_per_unit_kg: Number(l.weight_per_unit_kg),
      description: l.description,
    })),
});

/** Everything the plan board needs for the days from `from` to `to` (inclusive). */
export async function loadPlanData(from: string, to: string): Promise<PlanData> {
  const supabase = await createClient();
  const [
    loadsRes,
    poolRes,
    vehiclesRes,
    hauliersRes,
    driversRes,
    depotsRes,
    unitsRes,
    zonesRes,
    pzRes,
    orgRes,
    decisionsRes,
  ] = await Promise.all([
    supabase
      .from("loads")
      .select(
        "*, drivers:load_drivers(driver_id), stops:load_stops(*, orders:stop_orders!stop_orders_stop_id_organisation_id_fkey(order_id))",
      )
      .gte("load_date", from)
      .lte("load_date", to)
      .order("created_at"),
    supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("status", "unplanned")
      .order("required_date")
      .limit(500),
    supabase
      .from("vehicles")
      .select("*, capacities:vehicle_capacities(unit_type_id, max_units)")
      .order("name"),
    supabase.from("hauliers").select("id, name, haulier_type").eq("active", true).order("name"),
    supabase.from("drivers").select("id, name, available_days").eq("active", true).order("name"),
    supabase.from("depots").select("id, name, latitude, longitude, is_default").order("name"),
    supabase.from("unit_types").select("*"),
    supabase
      .from("compliance_zones")
      .select("id, name, requirement, min_gross_kg, max_gross_kg, postcode_districts")
      .eq("active", true),
    supabase.from("postcode_zones").select("id, name, postcode_areas").order("name"),
    supabase.from("organisations").select("warning_thresholds, site_info_stale_days").single(),
    supabase
      .from("warning_overrides")
      .select("load_id, warning_key, kind, reason, created_at, created_by, loads!inner(load_date)")
      .gte("loads.load_date", from)
      .lte("loads.load_date", to),
  ]);

  // An empty board because a query failed would be misleading; show the error page instead.
  for (const res of [loadsRes, poolRes, vehiclesRes, unitsRes, orgRes, decisionsRes]) {
    if (res.error) throw new Error(`Plan data: ${res.error.message}`);
  }

  type LoadRow = Omit<PlanLoad, "driver_ids" | "stops" | "start_time"> & {
    start_time: string;
    drivers: { driver_id: string }[];
    stops: (Omit<PlanLoad["stops"][number], "order_ids"> & { orders: { order_id: string }[] })[];
  };
  const loads: PlanLoad[] = ((loadsRes.data ?? []) as unknown as LoadRow[]).map((l) => ({
    id: l.id,
    load_date: l.load_date,
    depot_id: l.depot_id,
    vehicle_id: l.vehicle_id,
    haulier_id: l.haulier_id,
    crew_size: l.crew_size,
    start_time: hhmm(l.start_time)!,
    status: l.status,
    notes: l.notes,
    driver_ids: l.drivers.map((d) => d.driver_id),
    stops: l.stops
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        site_id: s.site_id,
        eta_from: hhmm(s.eta_from),
        eta_to: hhmm(s.eta_to),
        booking_ref: s.booking_ref,
        booking_slot: hhmm(s.booking_slot),
        status: s.status,
        confirmed: s.confirmed,
        confirmed_by: s.confirmed_by,
        confirmation_method: s.confirmation_method,
        confirmed_at: s.confirmed_at,
        confirmation_note: s.confirmation_note,
        order_ids: s.orders.map((o) => o.order_id),
      }))
      .sort((a, b) => a.sequence - b.sequence),
  }));

  // Orders on the loads, plus the unplanned pool.
  const plannedIds = loads.flatMap((l) => l.stops.flatMap((s) => s.order_ids));
  const plannedRes = plannedIds.length
    ? await supabase.from("orders").select(ORDER_COLUMNS).in("id", plannedIds)
    : { data: [] };
  const orders: Record<string, PlanOrder> = {};
  for (const o of [
    ...((plannedRes.data ?? []) as unknown as OrderRow[]),
    ...((poolRes.data ?? []) as unknown as OrderRow[]),
  ]) {
    orders[o.id] = toOrder(o);
  }
  const pool = ((poolRes.data ?? []) as unknown as OrderRow[]).map((o) => o.id);

  const siteIds = [
    ...new Set([
      ...Object.values(orders).map((o) => o.site_id),
      ...loads.flatMap((l) => l.stops.map((s) => s.site_id)),
    ]),
  ];
  const sitesRes = siteIds.length
    ? await supabase.from("sites").select("*").in("id", siteIds)
    : { data: [] };
  const sites: Record<string, PlanSite> = {};
  for (const s of (sitesRes.data ?? []) as Record<string, unknown>[]) {
    sites[s.id as string] = {
      id: s.id as string,
      customer_id: s.customer_id as string,
      name: s.name as string,
      address: s.address as string,
      postcode: s.postcode as string,
      latitude: num(s.latitude),
      longitude: num(s.longitude),
      max_vehicle_type: s.max_vehicle_type as string | null,
      max_length_m: num(s.max_length_m),
      max_weight_kg: num(s.max_weight_kg),
      no_hgvs: s.no_hgvs as boolean,
      site_equipment: s.site_equipment as string[],
      handball_allowed: s.handball_allowed as boolean,
      handball_people: num(s.handball_people),
      crane_drop_allowed: s.crane_drop_allowed as boolean,
      booking_required: s.booking_required as boolean,
      booking_lead_hours: num(s.booking_lead_hours),
      opening_hours: (s.opening_hours ?? {}) as PlanSite["opening_hours"],
      delivery_windows: (s.delivery_windows ?? {}) as PlanSite["delivery_windows"],
      last_verified_at: s.last_verified_at as string | null,
    };
  }

  const vehicles: PlanVehicle[] = ((vehiclesRes.data ?? []) as Record<string, unknown>[]).map(
    (v) => ({
      id: v.id as string,
      name: v.name as string,
      registration: v.registration as string,
      vehicle_type: v.vehicle_type as string,
      deck_length_mm: v.deck_length_mm as number,
      deck_width_mm: v.deck_width_mm as number,
      deck_height_mm: v.deck_height_mm as number,
      payload_kg: v.payload_kg as number,
      gross_weight_kg: v.gross_weight_kg as number,
      overall_length_m: Number(v.overall_length_m),
      unload_methods: v.unload_methods as string[],
      tail_lift_max_kg: num(v.tail_lift_max_kg),
      crane_max_kg: num(v.crane_max_kg),
      euro_standard: v.euro_standard as string,
      london_hgv_permit: v.london_hgv_permit as boolean,
      london_hgv_permit_expires: v.london_hgv_permit_expires as string | null,
      caz_compliant: v.caz_compliant as boolean,
      active: v.active as boolean,
      off_road_from: v.off_road_from as string | null,
      off_road_until: v.off_road_until as string | null,
      cost_per_mile: Number(v.cost_per_mile),
      cost_per_driver_hour: Number(v.cost_per_driver_hour),
      crew_size_default: v.crew_size_default as number,
      capacities: Object.fromEntries(
        ((v.capacities ?? []) as { unit_type_id: string; max_units: number }[]).map((c) => [
          c.unit_type_id,
          c.max_units,
        ]),
      ),
    }),
  );

  const unitTypes: Record<string, RuleUnitType> = {};
  for (const u of (unitsRes.data ?? []) as RuleUnitType[]) unitTypes[u.id] = u;

  // Names for "Overridden by …".
  type DecisionRow = {
    load_id: string;
    warning_key: string;
    kind: "override" | "dismiss";
    reason: string;
    created_at: string;
    created_by: string | null;
  };
  const decisionRows = (decisionsRes.data ?? []) as unknown as DecisionRow[];
  const people = [
    ...new Set(decisionRows.map((d) => d.created_by).filter((x): x is string => Boolean(x))),
  ];
  const { data: profiles } = people.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", people)
    : { data: [] };
  const nameOf = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));

  return {
    from,
    to,
    loads,
    orders,
    pool,
    sites,
    vehicles,
    hauliers: hauliersRes.data ?? [],
    drivers: driversRes.data ?? [],
    depots: (depotsRes.data ?? []).map((d) => ({
      ...d,
      latitude: num(d.latitude),
      longitude: num(d.longitude),
    })),
    unitTypes,
    zones: (zonesRes.data ?? []) as RuleZone[],
    postcodeZones: pzRes.data ?? [],
    thresholds: resolveThresholds(orgRes.data?.warning_thresholds),
    staleDays: orgRes.data?.site_info_stale_days ?? 180,
    decisions: decisionRows.map((d) => ({
      load_id: d.load_id,
      key: d.warning_key,
      kind: d.kind,
      reason: d.reason,
      by: d.created_by ? (nameOf[d.created_by] ?? "Someone") : "Someone",
      at: d.created_at,
    })),
  };
}
