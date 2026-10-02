import { describe, expect, it } from "vitest";
import { formObject } from "@/lib/settings/form";
import {
  parseCapacities,
  parseDepot,
  parseDriver,
  parseHaulier,
  parseOrganisation,
  parseRateCard,
  parseRatePrices,
  parseUnitType,
  parseVehicle,
  parseZone,
} from "@/lib/settings/schemas";
import { DEFAULT_THRESHOLDS, parseThresholds, resolveThresholds } from "@/lib/settings/thresholds";

const ZONE = "3f0c1d9e-2b7a-4c1e-9f00-123456789abc";

function fd(entries: [string, string][]) {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return formObject(data);
}

describe("formObject", () => {
  it("turns repeated names into arrays", () => {
    expect(
      fd([
        ["a", "1"],
        ["b", "x"],
        ["b", "y"],
      ]),
    ).toEqual({ a: "1", b: ["x", "y"] });
  });
});

describe("depots", () => {
  it("normalises the postcode and builds opening hours", () => {
    const r = parseDepot(
      fd([
        ["name", " Stroud factory "],
        ["postcode", "gl53aa"],
        ["loading_equipment", "forklift"],
        ["hours_mon_open", "07:00"],
        ["hours_mon_close", "17:00"],
      ]),
    );
    expect(r.ok && r.data).toMatchObject({
      name: "Stroud factory",
      postcode: "GL5 3AA",
      loading_equipment: ["forklift"],
      is_default: false,
      opening_hours: { mon: { open: "07:00", close: "17:00" }, sat: null },
    });
  });

  it("explains bad postcodes and hours", () => {
    const r = parseDepot(
      fd([
        ["name", "X"],
        ["postcode", "GL5"],
        ["hours_tue_open", "17:00"],
        ["hours_tue_close", "08:00"],
        ["hours_wed_open", "08:00"],
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.postcode).toMatch(/full UK postcode/);
      expect(r.errors.hours_tue).toMatch(/after opening/);
      expect(r.errors.hours_wed).toMatch(/both times/);
    }
  });
});

describe("unit types", () => {
  const base: [string, string][] = [
    ["name", "Door pack"],
    ["short_code", "dp"],
    ["colour_tag", "load-2"],
    ["length_mm", "2,200"],
    ["width_mm", "1000"],
    ["height_mm", "1200"],
    ["typical_weight_kg", "140"],
    ["min_unload_method", "forklift"],
    ["max_stack_height", "3"],
    ["must_stay_upright", "on"],
  ];

  it("parses numbers and ticks, and drops stack height when not stackable", () => {
    const r = parseUnitType(fd(base));
    expect(r.ok && r.data).toMatchObject({
      short_code: "DP",
      length_mm: 2200,
      must_stay_upright: true,
      fragile: false,
      stackable: false,
      max_stack_height: null,
    });
  });

  it("names the field in errors", () => {
    const r = parseUnitType(fd([...base.filter(([k]) => k !== "width_mm"), ["width_mm", "wide"]]));
    expect(!r.ok && r.errors.width_mm).toBe("Enter width as a number.");
  });
});

describe("vehicles", () => {
  const luton: [string, string][] = [
    ["name", "Luton 1"],
    ["registration", "ab12  cde"],
    ["vehicle_type", "luton"],
    ["ownership", "owned"],
    ["deck_length_mm", "4000"],
    ["deck_width_mm", "2000"],
    ["deck_height_mm", "2100"],
    ["payload_kg", "1000"],
    ["gross_weight_kg", "3500"],
    ["overall_length_m", "6.5"],
    ["unload_methods", "tail_lift"],
    ["tail_lift_max_kg", "750"],
    ["crane_max_kg", "2000"],
    ["crew_size_default", "1"],
    ["cost_per_mile", "£0.85"],
    ["cost_per_driver_hour", "15"],
    ["active", "on"],
  ];

  it("cleans the registration and only keeps limits for fitted equipment", () => {
    const r = parseVehicle(fd(luton));
    expect(r.ok && r.data).toMatchObject({
      registration: "AB12 CDE",
      tail_lift_max_kg: 750,
      crane_max_kg: null,
      cost_per_mile: 0.85,
      crew_size_default: 1,
    });
  });

  it("checks weights and equipment limits make sense", () => {
    const r = parseVehicle(
      fd([
        ...luton.filter(([k]) => !["gross_weight_kg", "tail_lift_max_kg"].includes(k)),
        ["gross_weight_kg", "900"],
      ]),
    );
    expect(!r.ok && r.errors).toMatchObject({
      gross_weight_kg: "Gross weight can't be less than the payload.",
      tail_lift_max_kg: "Enter the tail lift's maximum lift.",
    });
  });

  it("reads the capacity matrix", () => {
    expect(parseCapacities({ capacity_a: "12", capacity_b: "", capacity_c: "0" })).toEqual({
      ok: true,
      data: [{ unit_type_id: "a", max_units: 12 }],
    });
    expect(parseCapacities({ capacity_a: "1.5" }).ok).toBe(false);
  });
});

describe("drivers, zones and hauliers", () => {
  it("parses a driver", () => {
    const r = parseDriver(
      fd([
        ["name", "Dave"],
        ["phone", "07700 900123"],
        ["licence_categories", "C1"],
        ["available_days", "mon"],
        ["user_id", ""],
      ]),
    );
    expect(r.ok && r.data).toMatchObject({
      licence_categories: ["C1"],
      available_days: ["mon"],
      user_id: null,
    });
  });

  it("requires valid postcode areas in a zone", () => {
    expect(
      parseZone(
        fd([
          ["name", "West"],
          ["colour_tag", "load-1"],
          ["postcode_areas", "gl np"],
        ]),
      ),
    ).toMatchObject({
      ok: true,
      data: { postcode_areas: ["GL", "NP"] },
    });
    const bad = parseZone(
      fd([
        ["name", "West"],
        ["colour_tag", "load-1"],
        ["postcode_areas", "GL5"],
      ]),
    );
    expect(!bad.ok && bad.errors.postcode_areas).toMatch(/GL5 isn't a postcode area/);
  });

  it("parses a haulier with optional rating and email", () => {
    const r = parseHaulier(
      fd([
        ["name", "Severn"],
        ["haulier_type", "pallet_network"],
        ["rating", "4"],
        ["email", "bad"],
      ]),
    );
    expect(!r.ok && r.errors.email).toBe("Enter a valid email address.");
  });
});

describe("rate cards", () => {
  it("checks dates and reads the price grid", () => {
    const r = parseRateCard(
      fd([
        ["name", "2026"],
        ["valid_from", "2026-04-01"],
        ["valid_to", "2026-03-01"],
        ["per_drop", "25"],
        ["extra_drop", "10"],
        ["surcharge_tail_lift_per_pallet", "5"],
        ["surcharge_timed", "15"],
        ["surcharge_remote_area", "30"],
        ["remote_postcodes", "iv pa20"],
        ["surcharge_two_person", "20"],
        ["waiting_per_hour", "40"],
        ["waiting_free_minutes", "30"],
      ]),
    );
    expect(!r.ok && r.errors.valid_to).toMatch(/on or after/);
    expect(
      parseRatePrices({
        [`pallet_${ZONE}_full`]: "£42.50",
        [`load_${ZONE}_part`]: "",
        [`pallet_${ZONE}_huge`]: "1",
      }),
    ).toEqual({
      ok: true,
      data: { pallet: [{ zone_id: ZONE, pallet_size: "full", price: 42.5 }], load: [] },
    });
  });
});

describe("organisation and thresholds", () => {
  it("validates the accent colour", () => {
    expect(
      parseOrganisation(
        fd([
          ["name", "Example Doors Ltd"],
          ["accent_colour", "#E11D48"],
        ]),
      ),
    ).toMatchObject({
      ok: true,
      data: { accent_colour: "#e11d48" },
    });
    expect(
      parseOrganisation(
        fd([
          ["name", "X Ltd"],
          ["accent_colour", "red"],
        ]),
      ).ok,
    ).toBe(false);
  });

  it("falls back to defaults for missing or silly stored thresholds", () => {
    expect(resolveThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(resolveThresholds({ fill_gaps_miles: 25, capacity_near_limit_pct: 400 })).toMatchObject({
      fill_gaps_miles: 25,
      capacity_near_limit_pct: 90,
    });
    const filled = Object.fromEntries(
      Object.entries(DEFAULT_THRESHOLDS).map(([k, v]) => [k, String(v)]),
    );
    const good = parseThresholds({ ...filled, site_info_stale_days: "90" });
    expect(good.ok && good.data).toEqual({
      thresholds: DEFAULT_THRESHOLDS,
      site_info_stale_days: 90,
    });
    const bad = parseThresholds({
      ...filled,
      capacity_near_limit_pct: "120",
      site_info_stale_days: "90",
    });
    expect(!bad.ok && bad.errors.capacity_near_limit_pct).toMatch(/100% or less/);
  });
});
