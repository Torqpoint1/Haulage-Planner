import type { OpeningHours } from "@/lib/settings/schemas";
import type { Legs } from "@/lib/routing/legs";
import type { Thresholds } from "@/lib/settings/thresholds";

/**
 * Everything a check may look at, already loaded. Checks are pure functions
 * of this (spec 7.1), so the plan board, the server and tests all agree.
 */

export type RuleUnitType = {
  id: string;
  name: string;
  short_code: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  stackable: boolean;
  max_stack_height: number | null;
  must_stay_upright: boolean;
  requires_two_people: boolean;
  min_unload_method: "any" | "forklift" | "crane";
};

export type RuleLine = {
  unit_type_id: string;
  quantity: number;
  weight_per_unit_kg: number;
  description: string;
};

export type RuleOrder = {
  id: string;
  order_ref: string;
  readiness: "not_started" | "in_production" | "part_ready" | "ready";
  missing_items: string;
  expected_ready_date: string | null;
  required_date: string;
  latest_date: string | null;
  urgency?: "standard" | "timed" | "critical";
  lines: RuleLine[];
};

export type RuleSite = {
  id: string;
  customer_id: string;
  name: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  max_vehicle_type: string | null;
  max_length_m: number | null;
  max_weight_kg: number | null;
  no_hgvs: boolean;
  site_equipment: string[];
  handball_allowed: boolean;
  handball_people: number | null;
  crane_drop_allowed: boolean;
  booking_required: boolean;
  booking_lead_hours: number | null;
  opening_hours: OpeningHours;
  delivery_windows: OpeningHours;
  last_verified_at: string | null;
};

export type RuleStop = {
  id: string;
  sequence: number;
  site: RuleSite;
  orders: RuleOrder[];
  /** "HH:MM" or null */
  eta_from: string | null;
  eta_to: string | null;
  booking_ref: string;
  booking_slot: string | null;
  confirmed: boolean;
};

export type RuleVehicle = {
  id: string;
  name: string;
  registration: string;
  vehicle_type: string;
  deck_length_mm: number;
  deck_width_mm: number;
  deck_height_mm: number;
  payload_kg: number;
  gross_weight_kg: number;
  overall_length_m: number;
  unload_methods: string[];
  tail_lift_max_kg: number | null;
  crane_max_kg: number | null;
  euro_standard: string;
  london_hgv_permit: boolean;
  london_hgv_permit_expires: string | null;
  caz_compliant: boolean;
  active: boolean;
  off_road_from: string | null;
  off_road_until: string | null;
  /** unit_type_id → how many fit (the capacity matrix). */
  capacities: Record<string, number>;
};

export type RuleDepot = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

export type RuleLoad = {
  id: string;
  load_date: string;
  /** "HH:MM" */
  start_time: string;
  crew_size: number;
  status: string;
  vehicle: RuleVehicle | null;
  haulier: { id: string; name: string } | null;
  depot: RuleDepot;
};

export type RuleZone = {
  id: string;
  name: string;
  requirement: "euro_6" | "caz_compliant" | "hgv_permit";
  min_gross_kg: number | null;
  max_gross_kg: number | null;
  postcode_districts: string[];
};

/** Returnable assets (Stage 9); empty until then. */
export type RuleAsset = {
  id: string;
  asset_number: string;
  unit_type_name: string;
  site_id: string;
  expected_return_date: string | null;
};

export type RuleContext = {
  load: RuleLoad;
  /** In drop order. */
  stops: RuleStop[];
  unitTypes: Record<string, RuleUnitType>;
  /** The fleet, for "switch vehicle" fixes. */
  vehicles: RuleVehicle[];
  /** Vehicles already on another load that day. */
  busyVehicleIds: string[];
  thresholds: Thresholds;
  staleDays: number;
  zones: RuleZone[];
  assets: RuleAsset[];
  /** The moment the checks run. */
  now: Date;
  /** Today in Europe/London, yyyy-mm-dd. */
  today: string;
  /** Road legs from the routing provider; anything missing is estimated. */
  legs?: Legs;
  /** Set when a check is only being re-run to test a vehicle: don't work out fixes. */
  skipFixes?: boolean;
};

export const lineWeight = (l: RuleLine) => l.quantity * l.weight_per_unit_kg;

export const allOrders = (ctx: RuleContext) => ctx.stops.flatMap((s) => s.orders);
