import type { Decision } from "@/lib/rules";
import type { RuleOrder, RuleSite, RuleUnitType, RuleVehicle, RuleZone } from "@/lib/rules/context";
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
  hauliers: { id: string; name: string; haulier_type: string }[];
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
};
