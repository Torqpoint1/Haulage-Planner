import { describe, expect, it } from "vitest";
import { assetOverdue } from "../checks/asset-overdue";
import { driverHours } from "../checks/driver-hours";
import { crowMiles, estimateRun } from "../estimate";
import { CHECKS, runChecks, unresolvedBlocking, warningKey, withDecisions } from "../index";
import { dayKey, daysBetween, fromMinutes, londonInstant, toMinutes } from "../time";
import { context, order, site, stop } from "./fixtures";

const newcastle = site({
  id: "far",
  name: "Gateshead",
  postcode: "NE8 1AA",
  latitude: 54.96,
  longitude: -1.6,
});

describe("time helpers", () => {
  it("converts times and days", () => {
    expect(toMinutes("07:30")).toBe(450);
    expect(fromMinutes(450.4)).toBe("07:30");
    expect(fromMinutes(1500)).toBe("01:00");
    expect(dayKey("2026-10-06")).toBe("tue");
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
  });

  it("knows London's clocks in summer and winter", () => {
    expect(londonInstant("2026-07-01", "09:00").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(londonInstant("2026-12-01", "09:00").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});

describe("run estimate", () => {
  it("uses straight-line miles with a road factor, and gives up without locations", () => {
    expect(crowMiles({ latitude: 51.5, longitude: 0 }, { latitude: 51.5, longitude: 0 })).toBe(0);
    expect(
      crowMiles({ latitude: null, longitude: 0 }, { latitude: 51.5, longitude: 0 }),
    ).toBeNull();
    const run = estimateRun(context({ stops: [stop({ site: newcastle })] }));
    expect(run.miles).toBeGreaterThan(500);
    expect(run.dutyHours! - run.drivingHours!).toBeCloseTo((30 + 28) / 60);
    const lost = estimateRun(
      context({ stops: [stop({ site: site({ latitude: null, longitude: null }) })] }),
    );
    expect(lost.miles).toBeNull();
    expect(lost.stops[0].arrival).toBeNull();
  });

  it("waits for a planned slot before going on", () => {
    const run = estimateRun(context({ stops: [stop({ booking_slot: "10:00" }), stop()] }));
    expect(run.stops[0].expected).toBe(600);
    expect(run.stops[1].arrival!).toBeGreaterThanOrEqual(600 + 28);
  });
});

describe("DRIVER_HOURS", () => {
  it("is a check when the estimate is over the driving or duty limit, labelled as an estimate", () => {
    const [w] = driverHours(
      context({ stops: [stop({ site: newcastle, orders: [order({ order_ref: "SO-FAR" })] })] }),
    );
    expect(w).toMatchObject({ severity: "check", code: "DRIVER_HOURS" });
    expect(w.detail).toMatch(/^Estimate: about \d+\.\d hours driving \(limit 9\)/);
    expect(w.fixes[0].label).toBe("Take SO-FAR off this load");
  });

  it("passes short runs and can't judge without locations or a vehicle", () => {
    expect(driverHours(context())).toEqual([]);
    expect(driverHours(context({ stops: [stop({ site: site({ latitude: null }) })] }))).toEqual([]);
    expect(
      driverHours(context({ load: { vehicle: null }, stops: [stop({ site: newcastle })] })),
    ).toEqual([]);
  });

  it("follows the organisation's limits", () => {
    const ctx = context();
    ctx.thresholds.driver_max_duty_hours = 0.5;
    expect(driverHours(ctx)[0].detail).toContain("on duty (limit 0.5)");
  });
});

describe("ASSET_OVERDUE", () => {
  const asset = (expected: string | null, siteId = "s1") => ({
    id: "a1",
    asset_number: "ST-104",
    unit_type_name: "Glass stillage",
    site_id: siteId,
    expected_return_date: expected,
  });

  it("is info for assets past their return date at a stop's site", () => {
    const [w] = assetOverdue(context({ assets: [asset("2026-09-20")] }));
    expect(w).toMatchObject({
      severity: "info",
      title: "1 asset to collect at Stroud yard",
      detail: "Glass stillage ST-104 is overdue back from Stroud yard.",
    });
  });

  it("passes assets due today or later, with no date, or at other sites", () => {
    expect(
      assetOverdue(
        context({ assets: [asset("2026-10-01"), asset(null), asset("2026-01-01", "elsewhere")] }),
      ),
    ).toEqual([]);
  });
});

describe("runChecks", () => {
  it("covers every v1 check in spec 7.2", () => {
    expect(Object.keys(CHECKS)).toEqual([
      "CAPACITY_SPACE",
      "CAPACITY_WEIGHT",
      "UPRIGHT_TAIL_LIFT",
      "UPRIGHT_HANDBALL",
      "TAIL_LIFT_WEIGHT",
      "NO_UNLOAD_METHOD",
      "CREW_TOO_SMALL",
      "SITE_VEHICLE_ACCESS",
      "BOOKING_MISSING",
      "OUTSIDE_WINDOW",
      "ORDER_NOT_READY",
      "ORDER_PART_READY",
      "NOT_CONFIRMED",
      "SITE_INFO_STALE",
      "ZONE_COMPLIANCE",
      "DRIVER_HOURS",
      "LATE_DELIVERY",
      "ASSET_OVERDUE",
    ]);
  });

  it("finds nothing wrong with a sound load", () => {
    expect(runChecks(context())).toEqual([]);
  });

  it("sorts blocking first, then checks, then info", () => {
    const ctx = context({
      stops: [
        stop({
          confirmed: false,
          site: site({ last_verified_at: null, booking_required: true }),
          orders: [order({ readiness: "part_ready", expected_ready_date: "2026-10-01" })],
        }),
      ],
    });
    ctx.load.load_date = "2026-10-02";
    expect(runChecks(ctx).map((w) => w.severity)).toEqual(["blocking", "check", "check", "info"]);
  });
});

describe("overrides and dismissals", () => {
  const ctx = context({
    stops: [
      stop({
        site: site({ last_verified_at: null }),
        orders: [order({ id: "late", readiness: "not_started" })],
      }),
    ],
  });
  const warnings = runChecks(ctx);

  it("keys decisions to the warning's code and entity", () => {
    expect(warnings.map(warningKey)).toEqual([
      "ORDER_NOT_READY:order:late",
      expect.stringMatching(/^SITE_INFO_STALE:stop:/),
    ]);
  });

  it("an override clears a blocking warning; a dismissal only applies to checks and info", () => {
    const by = { by: "Sam Patel", reason: "Finishing at 6am" };
    const decided = withDecisions(warnings, {
      "ORDER_NOT_READY:order:late": { kind: "override", ...by },
      [warningKey(warnings[1])]: { kind: "dismiss", by: "Sam Patel", reason: "" },
    });
    expect(unresolvedBlocking(decided)).toEqual([]);
    expect(decided[1].decision?.kind).toBe("dismiss");

    const wrongKind = withDecisions(warnings, {
      "ORDER_NOT_READY:order:late": { kind: "dismiss", by: "Sam", reason: "" },
    });
    expect(unresolvedBlocking(wrongKind)).toHaveLength(1);
  });
});
