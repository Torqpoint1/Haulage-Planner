import { DEFAULT_THRESHOLDS } from "@/lib/settings/thresholds";
import type {
  RuleContext,
  RuleOrder,
  RuleSite,
  RuleStop,
  RuleUnitType,
  RuleVehicle,
} from "../context";

/** Builders for rules-engine tests. Defaults describe a load with no problems. */

export const EURO: RuleUnitType = {
  id: "eur",
  name: "Euro pallet",
  short_code: "EUR",
  length_mm: 1200,
  width_mm: 800,
  height_mm: 1200,
  stackable: false,
  max_stack_height: null,
  must_stay_upright: false,
  requires_two_people: false,
  min_unload_method: "any",
};

export const DOOR_PACK: RuleUnitType = {
  ...EURO,
  id: "dp",
  name: "Door pack",
  short_code: "DP",
  length_mm: 2200,
  width_mm: 1000,
  must_stay_upright: true,
  requires_two_people: true,
};

export const LONG: RuleUnitType = {
  ...EURO,
  id: "ll",
  name: "Long length",
  short_code: "LL",
  length_mm: 4800,
  width_mm: 300,
  height_mm: 300,
  stackable: true,
  max_stack_height: 4,
};

export function vehicle(over: Partial<RuleVehicle> = {}): RuleVehicle {
  return {
    id: "v1",
    name: "Rigid 1",
    registration: "AB12 CDE",
    vehicle_type: "18t",
    deck_length_mm: 7300,
    deck_width_mm: 2480,
    deck_height_mm: 2500,
    payload_kg: 9000,
    gross_weight_kg: 18000,
    overall_length_m: 10,
    unload_methods: ["side", "tail_lift"],
    tail_lift_max_kg: 1000,
    crane_max_kg: null,
    euro_standard: "Euro 6",
    london_hgv_permit: true,
    london_hgv_permit_expires: null,
    caz_compliant: true,
    active: true,
    off_road_from: null,
    off_road_until: null,
    capacities: { eur: 18 },
    ...over,
  };
}

export function site(over: Partial<RuleSite> = {}): RuleSite {
  return {
    id: "s1",
    customer_id: "c1",
    name: "Stroud yard",
    postcode: "GL5 3QF",
    latitude: 51.74,
    longitude: -2.22,
    max_vehicle_type: null,
    max_length_m: null,
    max_weight_kg: null,
    no_hgvs: false,
    site_equipment: ["forklift"],
    handball_allowed: false,
    handball_people: null,
    crane_drop_allowed: false,
    booking_required: false,
    booking_lead_hours: null,
    opening_hours: {},
    delivery_windows: {},
    last_verified_at: "2026-09-01T10:00:00Z",
    ...over,
  };
}

let orderCount = 0;
export function order(over: Partial<RuleOrder> = {}): RuleOrder {
  orderCount += 1;
  return {
    id: `o${orderCount}`,
    order_ref: `SO-${1000 + orderCount}`,
    readiness: "ready",
    missing_items: "",
    expected_ready_date: null,
    required_date: "2026-10-06",
    latest_date: null,
    lines: [{ unit_type_id: "eur", quantity: 4, weight_per_unit_kg: 300, description: "" }],
    ...over,
  };
}

let stopCount = 0;
export function stop(over: Partial<RuleStop> = {}): RuleStop {
  stopCount += 1;
  return {
    id: `stop${stopCount}`,
    sequence: stopCount,
    site: site(),
    orders: [order()],
    eta_from: null,
    eta_to: null,
    booking_ref: "",
    booking_slot: null,
    confirmed: true,
    ...over,
  };
}

/** A context for a load on Tuesday 06/10/2026, checked at 09:00 on Thursday 01/10/2026. */
export type ContextOverrides = Omit<Partial<RuleContext>, "load"> & {
  load?: Partial<RuleContext["load"]>;
};

export function context(over: ContextOverrides = {}): RuleContext {
  const { load, ...rest } = over;
  return {
    load: {
      id: "load1",
      load_date: "2026-10-06",
      start_time: "07:30",
      crew_size: 2,
      status: "planned",
      vehicle: vehicle(),
      haulier: null,
      depot: { id: "d1", name: "Stroud factory", latitude: 51.736, longitude: -2.224 },
      ...load,
    },
    stops: [stop()],
    unitTypes: { eur: EURO, dp: DOOR_PACK, ll: LONG },
    vehicles: [],
    busyVehicleIds: [],
    thresholds: { ...DEFAULT_THRESHOLDS },
    staleDays: 180,
    zones: [],
    assets: [],
    now: new Date("2026-10-01T08:00:00Z"),
    today: "2026-10-01",
    ...rest,
  };
}

export const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);
