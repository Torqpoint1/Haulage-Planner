import { describe, expect, it } from "vitest";
import { bookingMissing } from "../checks/booking-missing";
import { outsideWindow } from "../checks/outside-window";
import { siteInfoStale } from "../checks/site-info-stale";
import { siteVehicleAccess } from "../checks/site-vehicle-access";
import { zoneCompliance, zonesFor } from "../checks/zone-compliance";
import type { RuleZone } from "../context";
import { context, site, stop, vehicle } from "./fixtures";

const atSite = (over: Parameters<typeof site>[0], stopOver: Parameters<typeof stop>[0] = {}) =>
  context({ stops: [stop({ site: site(over), ...stopOver })] });

describe("SITE_VEHICLE_ACCESS", () => {
  it("blocks an HGV at a no-HGVs site, naming the reason", () => {
    const [w] = siteVehicleAccess(atSite({ no_hgvs: true, name: "Workshop" }));
    expect(w).toMatchObject({ severity: "blocking", title: "Rigid 1 can't get into Workshop" });
    expect(w.detail).toContain("the site is no HGVs");
  });

  it("checks length, weight and the largest vehicle type, and offers a vehicle that fits", () => {
    const ctx = atSite({ max_length_m: 9, max_weight_kg: 7500, max_vehicle_type: "7.5t" });
    ctx.vehicles = [
      vehicle({ id: "small", name: "7.5t 1", gross_weight_kg: 7500, overall_length_m: 8 }),
    ];
    const [w] = siteVehicleAccess(ctx);
    expect(w.detail).toContain("10 m long and the site takes 9 m");
    expect(w.detail).toContain("weighs up to 18,000 kg and the site takes 7,500 kg");
    expect(w.detail).toContain("the largest vehicle allowed is a 7.5 tonne");
    expect(w.fixes).toEqual([
      { id: "switch-vehicle", label: "Switch to 7.5t 1", params: { vehicleId: "small" } },
    ]);
  });

  it("passes at the limits and for vans at a no-HGVs site", () => {
    expect(
      siteVehicleAccess(
        atSite({ max_length_m: 10, max_weight_kg: 18000, max_vehicle_type: "18t" }),
      ),
    ).toEqual([]);
    const ctx = atSite({ no_hgvs: true });
    ctx.load.vehicle = vehicle({ gross_weight_kg: 3500 });
    expect(siteVehicleAccess(ctx)).toEqual([]);
  });

  it("ignores non-weight vehicle types it can't compare", () => {
    expect(siteVehicleAccess(atSite({ max_vehicle_type: "curtainsider" }))).toEqual([]);
  });
});

describe("BOOKING_MISSING", () => {
  it("is a check when the delivery is more than 24 hours away", () => {
    const [w] = bookingMissing(
      atSite({ booking_required: true, booking_lead_hours: 48, name: "Newport depot" }),
    );
    expect(w).toMatchObject({ severity: "check", title: "Book in at Newport depot" });
    expect(w.detail).toContain("at least 48 hours ahead");
    expect(w.fixes[0]).toMatchObject({
      id: "edit-stop",
      label: "Add booking ref",
      params: { field: "booking" },
    });
  });

  it("blocks within the organisation's window", () => {
    const ctx = atSite({ booking_required: true });
    ctx.load.load_date = "2026-10-02";
    expect(bookingMissing(ctx)[0].severity).toBe("blocking");
    ctx.thresholds.booking_blocking_hours = 12;
    expect(bookingMissing(ctx)[0].severity).toBe("check");
  });

  it("passes with a booking ref, or when the site doesn't need booking", () => {
    expect(bookingMissing(atSite({ booking_required: true }, { booking_ref: "GI-4471" }))).toEqual(
      [],
    );
    expect(bookingMissing(atSite({ booking_required: false }))).toEqual([]);
    expect(bookingMissing(atSite({ booking_required: true }, { booking_ref: "   " }))).toHaveLength(
      1,
    );
  });
});

describe("OUTSIDE_WINDOW", () => {
  const hours = { tue: { open: "08:00", close: "16:30" } };

  it("flags an estimated arrival before the site opens", () => {
    // The depot is next door, so the estimated arrival is just after the 07:30 start.
    const [w] = outsideWindow(atSite({ opening_hours: hours, name: "Stroud yard" }));
    expect(w).toMatchObject({
      severity: "check",
      title: "Arrives outside Stroud yard's opening hours",
    });
    expect(w.detail).toMatch(
      /estimated arrival at 07:3\d is outside the opening hours \(08:00–16:30\)/,
    );
  });

  it("uses the delivery window over opening hours, and a planned ETA over the estimate", () => {
    const ctx = atSite(
      { opening_hours: hours, delivery_windows: { tue: { open: "07:30", close: "11:00" } } },
      { eta_from: "11:30" },
    );
    expect(outsideWindow(ctx)[0].detail).toContain(
      "planned arrival at 11:30 is outside the delivery window (07:30–11:00)",
    );
    ctx.stops[0].eta_from = "10:00";
    expect(outsideWindow(ctx)).toEqual([]);
  });

  it("says when the site is closed that day, and passes when no hours are recorded", () => {
    expect(outsideWindow(atSite({ opening_hours: { mon: hours.tue } }))[0].title).toBe(
      "Stroud yard is closed that day",
    );
    expect(outsideWindow(atSite({ opening_hours: {} }))).toEqual([]);
    expect(outsideWindow(atSite({ opening_hours: hours }, { booking_slot: "16:30" }))).toEqual([]);
  });

  it("can't judge an arrival when a location is missing", () => {
    expect(
      outsideWindow(atSite({ opening_hours: hours, latitude: null, longitude: null })),
    ).toEqual([]);
  });
});

describe("SITE_INFO_STALE", () => {
  it("is info when the site was last checked more than 180 days ago", () => {
    const [w] = siteInfoStale(atSite({ last_verified_at: "2026-03-01T10:00:00Z" }));
    expect(w).toMatchObject({ severity: "info" });
    expect(w.detail).toContain("last checked on 01/03/2026, 214 days ago");
    expect(w.fixes[0]).toMatchObject({
      id: "verify-site",
      params: { siteId: "s1", customerId: "c1" },
    });
  });

  it("flags sites never checked, passes on the day the period ends, and follows the setting", () => {
    expect(siteInfoStale(atSite({ last_verified_at: null }))[0].detail).toContain(
      "never been checked",
    );
    expect(siteInfoStale(atSite({ last_verified_at: "2026-04-04T09:00:00Z" }))).toEqual([]);
    const ctx = atSite({ last_verified_at: "2026-09-01T09:00:00Z" });
    ctx.staleDays = 7;
    expect(siteInfoStale(ctx)).toHaveLength(1);
  });
});

describe("ZONE_COMPLIANCE", () => {
  const zones: RuleZone[] = [
    {
      id: "z1",
      name: "London HGV Safety Permit",
      requirement: "hgv_permit",
      min_gross_kg: 12001,
      max_gross_kg: null,
      postcode_districts: ["SW", "BR1"],
    },
    {
      id: "z2",
      name: "London Low Emission Zone",
      requirement: "euro_6",
      min_gross_kg: 3501,
      max_gross_kg: null,
      postcode_districts: ["SW", "BR1"],
    },
    {
      id: "z3",
      name: "Bath Clean Air Zone",
      requirement: "caz_compliant",
      min_gross_kg: null,
      max_gross_kg: null,
      postcode_districts: ["BA1"],
    },
  ];
  const inZone = (postcode: string, v = vehicle()) => {
    const ctx = atSite({ postcode, name: "Customer" });
    ctx.load.vehicle = v;
    ctx.zones = zones;
    return ctx;
  };

  it("matches whole areas and exact districts only", () => {
    expect(zonesFor("SW1A 1AA", zones).map((z) => z.id)).toEqual(["z1", "z2"]);
    expect(zonesFor("BR1 3AA", zones).map((z) => z.id)).toEqual(["z1", "z2"]);
    expect(zonesFor("BR11 3AA", zones)).toEqual([]);
    expect(zonesFor("BA12 0AA", zones)).toEqual([]);
  });

  it("flags a missing or expired HGV permit and a non-Euro 6 engine", () => {
    const [w] = zoneCompliance(
      inZone("SW1A 1AA", vehicle({ london_hgv_permit: false, euro_standard: "Euro 5" })),
    );
    expect(w.severity).toBe("check");
    expect(w.detail).toContain("has no London HGV Safety Permit");
    expect(w.detail).toContain("needs a Euro 6 engine (Euro 5)");
    const expired = zoneCompliance(
      inZone("BR1 3AA", vehicle({ london_hgv_permit_expires: "2026-09-30" })),
    );
    expect(expired[0].detail).toContain("expired on 30/09/2026");
  });

  it("flags clean air zones and offers a compliant vehicle", () => {
    const ctx = inZone("BA1 1AA", vehicle({ caz_compliant: false }));
    ctx.vehicles = [vehicle({ id: "clean", name: "Clean 1" })];
    const [w] = zoneCompliance(ctx);
    expect(w.title).toBe("Bath Clean Air Zone");
    expect(w.fixes).toEqual([
      { id: "switch-vehicle", label: "Switch to Clean 1", params: { vehicleId: "clean" } },
    ]);
  });

  it("passes compliant vehicles and those outside a rule's weight band", () => {
    expect(zoneCompliance(inZone("SW1A 1AA"))).toEqual([]);
    const van = vehicle({
      gross_weight_kg: 3500,
      london_hgv_permit: false,
      euro_standard: "Euro 5",
    });
    expect(zoneCompliance(inZone("SW1A 1AA", van))).toEqual([]);
    expect(zoneCompliance(inZone("GL5 3QF", vehicle({ caz_compliant: false })))).toEqual([]);
  });
});
