import { describe, expect, it } from "vitest";
import { buildContext } from "@/lib/planning/build";
import { fillGaps } from "../fill-gaps";
import { routeMiles, suggestStopOrder } from "../stop-order";
import { dayFor, suggestLoads } from "../suggest-loads";
import { CLOCK, SITES, emptyLoad, planData, planOrder, planVehicle, stopFor } from "./fixtures";

const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];

describe("suggestStopOrder", () => {
  const [far, near] = [planOrder("newport"), planOrder("glos")];
  const data = planData({ orders: { [far.id]: far, [near.id]: near } });
  const ctxFor = (stops: ReturnType<typeof stopFor>[]) =>
    buildContext(emptyLoad({ stops }), data, CLOCK);

  it("suggests the nearest stop each time, saying how many miles it saves", () => {
    const ctx = ctxFor([
      stopFor("a", "chelt", []),
      stopFor("b", "newport", [far.id], { sequence: 2 }),
      stopFor("c", "glos", [near.id], { sequence: 3 }),
    ]);
    const s = suggestStopOrder(ctx)!;
    expect([...s.stopIds].sort()).toEqual(["a", "b", "c"]);
    expect(s.miles).toBeLessThan(s.currentMiles);
    expect(s.reasons[0]).toBe(
      "Nearest stop each time from Stroud factory, tidied so the route doesn't double back.",
    );
    expect(s.reasons[1]).toMatch(/^Saves about \d+\.\d miles/);
  });

  it("keeps a fixed slot even when another stop is nearer", () => {
    const ctx = ctxFor([
      stopFor("a", "glos", [near.id]),
      stopFor("b", "newport", [far.id], { sequence: 2, booking_slot: "08:30" }),
    ]);
    const s = suggestStopOrder(ctx)!;
    expect(s.stopIds).toEqual(["b", "a"]);
    expect(s.reasons).toContain("Keeps the 08:30 slot at Newport.");
  });

  it("tidies a route that doubles back, even when nearest-first alone wouldn't help", () => {
    // Swindon, Gloucester, Newport: nearest-first (Gloucester, Swindon, Newport) is longer,
    // but Gloucester, Newport, Swindon is shorter than both.
    const swindon = {
      ...SITES.chelt,
      id: "swindon",
      name: "Swindon",
      latitude: 51.56291,
      longitude: -1.78104,
    };
    const ctx = buildContext(
      emptyLoad({
        stops: [
          stopFor("s", "swindon", []),
          stopFor("g", "glos", [], { sequence: 2 }),
          stopFor("n", "newport", [], { sequence: 3 }),
        ],
      }),
      planData({ sites: { ...SITES, swindon } }),
      CLOCK,
    );
    const s = suggestStopOrder(ctx)!;
    expect(s.stopIds).toEqual(["g", "n", "s"]);
    expect(s.miles).toBeLessThan(s.currentMiles);
  });

  it("says nothing when the order is already best, or there's one stop", () => {
    const ctx = ctxFor([
      stopFor("a", "glos", [near.id]),
      stopFor("b", "chelt", [], { sequence: 2 }),
      stopFor("c", "newport", [far.id], { sequence: 3 }),
    ]);
    expect(suggestStopOrder({ ...ctx, stops: [ctx.stops[0]] })).toBeNull();
    const best = suggestStopOrder(ctx);
    expect(best === null || best.miles < routeMiles(ctx, ctx.stops)!).toBe(true);
  });
});

describe("fillGaps", () => {
  const onLoad = planOrder("glos");
  const base = (candidates: ReturnType<typeof planOrder>[], vehicle = planVehicle()) => {
    const data = planData({
      orders: Object.fromEntries([onLoad, ...candidates].map((o) => [o.id, o])),
      vehicles: [vehicle],
    });
    const ctx = buildContext(
      emptyLoad({ stops: [stopFor("s1", "glos", [onLoad.id])] }),
      data,
      CLOCK,
    );
    return fillGaps(
      ctx,
      candidates.map((c) => ({ ...c, site: SITES[c.site_id] })),
      vehicle,
      10,
    );
  };

  it("suggests ready orders near the route with extra miles and the saving", () => {
    const early = planOrder("chelt", { required_date: "2026-10-08" });
    const [gap] = base([early]);
    expect(gap).toMatchObject({ orderId: early.id, timing: "early", siteName: "Cheltenham" });
    expect(gap.extraMiles).toBeGreaterThan(0);
    expect(gap.saving!).toBeGreaterThan(0);
    expect(gap.reasons).toContain("Needed 08/10/2026; it's ready, so it could go early.");
  });

  it("adds no miles for another order to a site already on the route", () => {
    const [gap] = base([planOrder("glos")]);
    expect(gap.extraMiles).toBe(0);
    expect(gap.timing).toBe("on time");
  });

  it("leaves out orders that are far away, not ready, too late, too early or would overload the vehicle", () => {
    expect(
      base([
        planOrder("newport"),
        planOrder("chelt", { readiness: "in_production", expected_ready_date: "2026-10-09" }),
        planOrder("chelt", { required_date: "2026-10-05" }),
        planOrder("chelt", { earliest_date: "2026-10-07" }),
        planOrder("chelt", {
          lines: [{ unit_type_id: "eur", quantity: 30, weight_per_unit_kg: 100, description: "" }],
        }),
      ]),
    ).toEqual([]);
  });

  it("only applies to own vehicles", () => {
    const data = planData({ orders: { [onLoad.id]: onLoad } });
    const ctx = buildContext(
      emptyLoad({ stops: [stopFor("s1", "glos", [onLoad.id])] }),
      data,
      CLOCK,
    );
    expect(fillGaps(ctx, [{ ...planOrder("chelt"), site: SITES.chelt }], null, 10)).toEqual([]);
  });
});

describe("dayFor", () => {
  it("prefers the required date, else the latest on-time day, else the first day for overdue orders", () => {
    expect(dayFor(planOrder("glos"), days, CLOCK.today)).toEqual({ day: "2026-10-06" });
    expect(dayFor(planOrder("glos", { required_date: "2026-10-12" }), days, CLOCK.today)).toEqual({
      day: "2026-10-09",
    });
    expect(dayFor(planOrder("glos", { required_date: "2026-09-30" }), days, CLOCK.today)).toEqual({
      day: "2026-10-05",
    });
    expect(
      dayFor(
        planOrder("glos", { readiness: "in_production", expected_ready_date: "2026-10-07" }),
        days,
        CLOCK.today,
      ),
    ).toEqual({ day: null, reason: "Not ready until 07/10/2026, after it's needed on 06/10/2026" });
    expect(dayFor(planOrder("glos", { readiness: "not_started" }), days, CLOCK.today)).toEqual({
      day: null,
      reason: "Not ready and no expected ready date",
    });
  });
});

describe("suggestLoads", () => {
  it("groups nearby orders due the same day onto the smallest vehicle that takes them, explaining why", () => {
    const [a, b, c] = [planOrder("glos"), planOrder("chelt"), planOrder("glos")];
    const data = planData({
      orders: Object.fromEntries([a, b, c].map((o) => [o.id, o])),
      pool: [a.id, b.id, c.id],
      vehicles: [
        planVehicle({ id: "big", name: "18t", payload_kg: 9000 }),
        planVehicle({
          id: "small",
          name: "7.5t",
          vehicle_type: "7.5t",
          payload_kg: 4000,
          gross_weight_kg: 7500,
        }),
      ],
    });
    const { proposals, unplaced } = suggestLoads(data, days, CLOCK);
    expect(unplaced).toEqual([]);
    expect(proposals).toHaveLength(1);
    const [p] = proposals;
    expect(p).toMatchObject({ date: "2026-10-06", vehicleId: "small" });
    expect(p.orderIds.sort()).toEqual([a.id, b.id, c.id].sort());
    expect(p.summary).toMatch(
      /^2 drops · \d+ miles spread · 7\.5 tonne · 12\/18 EUR · no blocking warnings/,
    );
    expect(p.reasons).toEqual([
      "All due 06/10/2026.",
      expect.stringMatching(
        /^Grouped because the drops are within \d+ miles of each other, furthest \d+ miles from Stroud factory\.$/,
      ),
      "7.5t is the smallest free vehicle that takes them all without a blocking warning.",
      "Drop order: nearest stop each time from Stroud factory, without doubling back.",
      "Distances are estimates (straight line × 1.3).",
    ]);
  });

  it("splits far-apart orders, respects busy vehicles, and explains what it couldn't place", () => {
    const [near, far, unready] = [
      planOrder("glos"),
      planOrder("newport"),
      planOrder("chelt", { readiness: "in_production", expected_ready_date: "2026-10-20" }),
    ];
    const data = planData({
      orders: Object.fromEntries([near, far, unready].map((o) => [o.id, o])),
      pool: [near.id, far.id, unready.id],
      vehicles: [
        planVehicle({ id: "a", name: "Truck A" }),
        planVehicle({ id: "b", name: "Truck B" }),
        planVehicle({ id: "c", name: "Truck C" }),
      ],
      loads: [emptyLoad({ id: "existing", vehicle_id: "c", load_date: "2026-10-06" })],
    });
    const { proposals, unplaced } = suggestLoads(data, days, CLOCK);
    expect(proposals.map((p) => p.orderIds)).toEqual([[far.id], [near.id]]);
    expect(proposals.map((p) => p.vehicleId)).not.toContain("c");
    expect(unplaced).toEqual([
      { orderId: unready.id, orderRef: unready.order_ref, reason: "Not ready until 20/10/2026" },
    ]);

    const oneTruck = suggestLoads(
      { ...data, vehicles: [planVehicle({ id: "a", name: "Truck A" })] },
      days,
      CLOCK,
    );
    expect(oneTruck.unplaced.map((u) => u.reason)).toContain("No vehicle free on 06/10/2026");
  });
});
