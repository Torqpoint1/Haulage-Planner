import { DOOR_PACK, EURO, site, vehicle } from "@/lib/rules/__tests__/fixtures";
import type {
  PlanData,
  PlanHaulier,
  PlanLoad,
  PlanOrder,
  PlanRateCard,
  PlanSite,
  PlanVehicle,
} from "@/lib/planning/types";
import { DEFAULT_THRESHOLDS } from "@/lib/settings/thresholds";

/** A small company near Stroud for suggestion tests. Distances are estimates (no road legs). */

export const SITES: Record<string, PlanSite> = {
  glos: {
    ...site({
      id: "glos",
      name: "Gloucester",
      postcode: "GL1 2BB",
      latitude: 51.86142,
      longitude: -2.24412,
    }),
    address: "",
  },
  chelt: {
    ...site({
      id: "chelt",
      name: "Cheltenham",
      postcode: "GL50 1HX",
      latitude: 51.89965,
      longitude: -2.07846,
    }),
    address: "",
  },
  newport: {
    ...site({
      id: "newport",
      name: "Newport",
      postcode: "NP20 4AA",
      latitude: 51.58731,
      longitude: -2.99771,
    }),
    address: "",
  },
  tyne: {
    ...site({
      id: "tyne",
      name: "Gateshead",
      postcode: "NE8 3AA",
      latitude: 54.957,
      longitude: -1.603,
    }),
    address: "",
  },
};

let n = 0;
export function planOrder(siteId: string, over: Partial<PlanOrder> = {}): PlanOrder {
  n += 1;
  return {
    id: `o${n}`,
    order_ref: `SO-${100 + n}`,
    readiness: "ready",
    missing_items: "",
    expected_ready_date: null,
    required_date: "2026-10-06",
    latest_date: null,
    earliest_date: null,
    lines: [{ unit_type_id: "eur", quantity: 4, weight_per_unit_kg: 300, description: "" }],
    customer_id: "c1",
    customer_name: "Hillside",
    site_id: siteId,
    urgency: "standard",
    status: "unplanned",
    ...over,
  };
}

export const planVehicle = (over: Partial<PlanVehicle> = {}): PlanVehicle => ({
  ...vehicle(),
  cost_per_mile: 1,
  cost_per_driver_hour: 20,
  crew_size_default: 1,
  ...over,
});

export const card = (over: Partial<PlanRateCard> = {}): PlanRateCard => ({
  id: "card1",
  name: "2026 tariff",
  valid_from: "2026-01-01",
  valid_to: null,
  per_drop: 0,
  extra_drop: 10,
  surcharge_tail_lift_per_pallet: 5,
  surcharge_timed: 15,
  surcharge_remote_area: 20,
  remote_postcodes: [],
  surcharge_two_person: 25,
  waiting_per_hour: 30,
  waiting_free_minutes: 30,
  pallet: { west: { quarter: 20, half: 30, full: 40 } },
  load: {},
  ...over,
});

export const haulier = (over: Partial<PlanHaulier> = {}): PlanHaulier => ({
  id: "h1",
  name: "Severn Pallets",
  haulier_type: "pallet_network",
  coverage_areas: ["GL", "NP"],
  services: ["tail_lift", "timed"],
  rateCards: [card()],
  ...over,
});

export function emptyLoad(over: Partial<PlanLoad> = {}): PlanLoad {
  return {
    id: "load1",
    load_date: "2026-10-06",
    depot_id: "d1",
    vehicle_id: "v1",
    haulier_id: null,
    crew_size: 1,
    start_time: "07:30",
    status: "planned",
    notes: "",
    driver_ids: [],
    stops: [],
    ...over,
  };
}

export const stopFor = (
  id: string,
  siteId: string,
  orderIds: string[],
  over: Partial<PlanLoad["stops"][number]> = {},
) => ({
  id,
  sequence: 1,
  site_id: siteId,
  eta_from: null,
  eta_to: null,
  booking_ref: "",
  booking_slot: null,
  status: "pending",
  confirmed: true,
  confirmed_by: "",
  confirmation_method: null,
  confirmed_at: null,
  confirmation_note: "",
  order_ids: orderIds,
  ...over,
});

export function planData(over: Partial<PlanData> = {}): PlanData {
  return {
    from: "2026-10-05",
    to: "2026-10-11",
    loads: [],
    orders: {},
    pool: [],
    sites: SITES,
    vehicles: [planVehicle()],
    hauliers: [],
    drivers: [],
    depots: [
      { id: "d1", name: "Stroud factory", latitude: 51.736, longitude: -2.224, is_default: true },
    ],
    unitTypes: { eur: EURO, dp: DOOR_PACK },
    zones: [],
    postcodeZones: [
      { id: "west", name: "Gloucestershire", postcode_areas: ["GL"] },
      { id: "wales", name: "South Wales", postcode_areas: ["NP", "CF"] },
    ],
    thresholds: { ...DEFAULT_THRESHOLDS },
    staleDays: 180,
    decisions: [],
    legs: {},
    ...over,
  };
}

export const CLOCK = { now: new Date("2026-10-01T08:00:00Z"), today: "2026-10-01" };
