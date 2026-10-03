import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/lib/settings/thresholds";
import { EURO, order, site, vehicle } from "@/lib/rules/__tests__/fixtures";
import { buildContext, loadMetrics, loadWarnings } from "../build";
import type { PlanData, PlanLoad } from "../types";

const planOrder = (id: string, siteId: string, quantity: number) => ({
  ...order({
    id,
    order_ref: id.toUpperCase(),
    lines: [{ unit_type_id: "eur", quantity, weight_per_unit_kg: 500, description: "" }],
  }),
  customer_id: "c1",
  customer_name: "Hillside",
  site_id: siteId,
  urgency: "standard" as const,
  status: "planned",
  earliest_date: null,
});

const load: PlanLoad = {
  id: "l1",
  load_date: "2026-10-06",
  depot_id: "d1",
  vehicle_id: "v1",
  haulier_id: null,
  crew_size: 1,
  start_time: "07:30",
  status: "planned",
  notes: "",
  driver_ids: [],
  stops: [
    {
      id: "s1",
      sequence: 1,
      site_id: "a",
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
      order_ids: ["o1"],
    },
  ],
};

const data: PlanData = {
  from: "2026-10-05",
  to: "2026-10-11",
  loads: [load, { ...load, id: "l2", stops: [] }],
  orders: {
    o1: planOrder("o1", "a", 10),
    o2: planOrder("o2", "a", 4),
    o3: planOrder("o3", "b", 6),
  },
  pool: ["o2", "o3"],
  sites: {
    a: { ...site({ id: "a", name: "Yard A" }), address: "" },
    b: { ...site({ id: "b", name: "Yard B" }), address: "" },
  },
  vehicles: [
    {
      ...vehicle({ payload_kg: 9000 }),
      cost_per_mile: 1,
      cost_per_driver_hour: 20,
      crew_size_default: 1,
    },
  ],
  hauliers: [],
  drivers: [],
  depots: [{ id: "d1", name: "Depot", latitude: 51.736, longitude: -2.224, is_default: true }],
  unitTypes: { eur: EURO },
  zones: [],
  postcodeZones: [],
  thresholds: { ...DEFAULT_THRESHOLDS },
  staleDays: 180,
  decisions: [],
};
const clock = { now: new Date("2026-10-01T08:00:00Z"), today: "2026-10-01" };

describe("buildContext", () => {
  it("previews a dragged order on its site's stop, or as a new stop", () => {
    const sameSite = buildContext(load, data, clock, ["o2"]);
    expect(sameSite.stops).toHaveLength(1);
    expect(sameSite.stops[0].orders.map((o) => o.id)).toEqual(["o1", "o2"]);
    const newSite = buildContext(load, data, clock, ["o3"]);
    expect(newSite.stops.map((s) => s.site.name)).toEqual(["Yard A", "Yard B"]);
  });

  it("marks vehicles on other loads that day as busy", () => {
    const ctx = buildContext(
      data.loads[1],
      { ...data, loads: [load, { ...data.loads[1], vehicle_id: null }] },
      clock,
    );
    expect(ctx.busyVehicleIds).toEqual(["v1"]);
  });

  it("works out capacity, an estimated cost and live warnings", () => {
    const ctx = buildContext(load, data, clock, ["o2", "o3"]);
    const metrics = loadMetrics(ctx, data);
    expect(metrics.space?.units).toEqual({ used: 20, max: 18, code: "EUR" });
    expect(metrics.weightKg).toBe(10_000);
    expect(metrics.costEstimate).toBeGreaterThan(0);
    expect(loadWarnings(ctx, data).map((w) => w.code)).toEqual(
      expect.arrayContaining(["CAPACITY_SPACE", "CAPACITY_WEIGHT"]),
    );
  });

  it("attaches the planner's override to the matching warning", () => {
    const ctx = buildContext(load, data, clock, ["o2", "o3"]);
    const decided = loadWarnings(ctx, {
      ...data,
      decisions: [
        {
          load_id: "l1",
          key: "CAPACITY_SPACE:load:l1",
          kind: "override",
          reason: "Two trips",
          by: "Sam",
          at: "",
        },
      ],
    });
    expect(decided.find((w) => w.code === "CAPACITY_SPACE")?.decision?.reason).toBe("Two trips");
  });
});
