import type { Decision } from "@/lib/rules";
import type { RuleOrder, RuleSite, RuleUnitType, RuleVehicle, RuleZone } from "@/lib/rules/context";
import type { Legs } from "@/lib/routing/legs";
import type { Thresholds } from "@/lib/settings/thresholds";

/** What the plan board loads for a range of days (spec 9.2). Plain data, safe to pass to the browser. */

export const LOAD_STATUSES = [
  { value: "draft", label: "Draft", tone: "neutral" },
  { value: "planned", label: "Planned", tone: "info" },
  { value: "confirmed", label: "Confirmed", tone: "success" },
  { value: "loading", label: "Loading", tone: "info" },
  { value: "out", label: "Out", tone: "info" },
  { value: "complete", label: "Complete", tone: "success" },
] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number]["value"];

export const CONFIRMATION_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
  { value: "in_person", label: "In person" },
  { value: "portal", label: "Portal" },
] as const;

export type PlanOrder = RuleOrder & {
  customer_id: string;
  customer_name: string;
  site_id: string;
  urgency: "standard" | "timed" | "critical";
  status: string;
  earliest_date: string | null;
};

export type PlanSite = RuleSite & { address: string };

export type PlanVehicle = RuleVehicle & {
  cost_per_mile: number;
  cost_per_driver_hour: number;
  crew_size_default: number;
};

export type PalletSize = "quarter" | "half" | "full";

export type PlanRateCard = {
  id: string;
  name: string;
  valid_from: string;
  valid_to: string | null;
  per_drop: number;
  extra_drop: number;
  surcharge_tail_lift_per_pallet: number;
  surcharge_timed: number;
  surcharge_remote_area: number;
  remote_postcodes: string[];
  surcharge_two_person: number;
  waiting_per_hour: number;
  waiting_free_minutes: number;
  /** zone id → price per pallet size. */
  pallet: Record<string, Partial<Record<PalletSize, number>>>;
  /** zone id → full or part load price. */
  load: Record<string, Partial<Record<"full" | "part", number>>>;
};

export type PlanHaulier = {
  id: string;
  name: string;
  haulier_type: string;
  coverage_areas: string[];
  services: string[];
  rateCards: PlanRateCard[];
};

export type PlanStop = {
  id: string;
  sequence: number;
  site_id: string;
  eta_from: string | null;
  eta_to: string | null;
  booking_ref: string;
  booking_slot: string | null;
  status: string;
  confirmed: boolean;
  confirmed_by: string;
  confirmation_method: string | null;
  confirmed_at: string | null;
  confirmation_note: string;
  order_ids: string[];
  /** Returnable assets planned onto this stop: drops go out with the delivery, collections come back. */
  assets: PlanStopAsset[];
};

export type PlanStopAsset = {
  asset_id: string;
  direction: "drop" | "collect";
  outcome: "pending" | "done" | "not_done";
};

/** A returnable asset (spec 6.11). Lost and retired ones aren't loaded for planning. */
export type PlanAsset = {
  id: string;
  asset_number: string;
  unit_type_id: string;
  unit_type_name: string;
  status: "at_depot" | "on_vehicle" | "at_customer";
  depot_id: string | null;
  customer_id: string | null;
  site_id: string | null;
  load_id: string | null;
  expected_return_date: string | null;
};

export type PlanLoad = {
  id: string;
  load_date: string;
  depot_id: string;
  vehicle_id: string | null;
  haulier_id: string | null;
  crew_size: number;
  start_time: string;
  status: LoadStatus;
  notes: string;
  driver_ids: string[];
  stops: PlanStop[];
  /** Made from a standing run (spec 6.12). */
  standing_run_id: string | null;
  /** What a haulier agreed to charge for this load. */
  agreed_price: number | null;
};

export type PlanDecision = Decision & { load_id: string; key: string; at: string };

export type PlanData = {
  from: string;
  to: string;
  loads: PlanLoad[];
  /** Every order the board shows: the unplanned pool and those on the loads. */
  orders: Record<string, PlanOrder>;
  /** Unplanned order ids, soonest first. */
  pool: string[];
  sites: Record<string, PlanSite>;
  vehicles: PlanVehicle[];
  hauliers: PlanHaulier[];
  drivers: { id: string; name: string; available_days: string[] }[];
  depots: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    is_default: boolean;
  }[];
  unitTypes: Record<string, RuleUnitType>;
  zones: RuleZone[];
  postcodeZones: { id: string; name: string; postcode_areas: string[] }[];
  thresholds: Thresholds;
  staleDays: number;
  decisions: PlanDecision[];
  /** Road legs along each load's route (from the routing provider or its cache). */
  legs: Legs;
  /** Warehouse progress per load (spec 9.5: visible to the planner on the load card). */
  picking: Record<string, PickProgress>;
  /** Returnable assets at depots, on vehicles and at customers. */
  assets: PlanAsset[];
  /** Standing runs the week's loads came from. */
  standingRuns: { id: string; name: string }[];
};

export type PickProgress = {
  lines: number;
  picked: number;
  loaded: number;
  shortages: { orderRef: string; note: string }[];
};
