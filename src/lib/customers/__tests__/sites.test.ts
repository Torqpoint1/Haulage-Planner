import { describe, expect, it } from "vitest";
import { parseContact, parseCustomer, parseSite } from "@/lib/customers/schemas";
import { siteFreshness, siteRestrictions, type SiteRules } from "@/lib/customers/sites";

const open: SiteRules = {
  max_vehicle_type: null,
  max_length_m: null,
  max_weight_kg: null,
  no_hgvs: false,
  height_limit_m: null,
  narrow_access_note: "",
  site_equipment: ["forklift"],
  handball_allowed: false,
  handball_people: null,
  crane_drop_allowed: false,
  booking_required: false,
  booking_lead_hours: null,
  ppe_required: false,
  induction_required: false,
  contact_must_be_present: false,
};

describe("siteRestrictions", () => {
  it("lists nothing worrying for an easy site", () => {
    expect(siteRestrictions(open).map((r) => r.label)).toEqual(["Forklift on site"]);
  });

  it("describes every restriction in plain English", () => {
    const labels = siteRestrictions({
      ...open,
      no_hgvs: true,
      max_vehicle_type: "7.5t",
      max_length_m: 10,
      max_weight_kg: 7500,
      height_limit_m: 3.8,
      narrow_access_note: "Tight turn at the gate",
      site_equipment: [],
      handball_allowed: true,
      handball_people: 2,
      booking_required: true,
      booking_lead_hours: 24,
      ppe_required: true,
      induction_required: true,
      contact_must_be_present: true,
    }).map((r) => r.label);
    expect(labels).toEqual([
      "No HGVs",
      "Max 7.5 tonne",
      "Max length 10 m",
      "Max weight 7,500 kg",
      "Height limit 3.8 m",
      "Narrow access",
      "Handball OK (2 people)",
      "Book 24 h ahead",
      "PPE required",
      "Induction required",
      "Contact must be present",
    ]);
  });

  it("flags a site with no way to unload", () => {
    const r = siteRestrictions({ ...open, site_equipment: [] });
    expect(r).toEqual([
      { key: "no_unload", label: "No unloading equipment", group: "unloading", tone: "warning" },
    ]);
  });
});

describe("siteFreshness", () => {
  const now = new Date("2026-10-03T12:00:00Z");

  it("treats never-verified sites as stale", () => {
    expect(siteFreshness(null, 180, now)).toEqual({ stale: true, label: "Never verified" });
  });

  it("is fresh within the period and stale after it", () => {
    expect(siteFreshness("2026-09-01T10:00:00Z", 180, now)).toEqual({
      stale: false,
      label: "Verified 01/09/2026",
    });
    expect(siteFreshness("2026-01-01T10:00:00Z", 180, now)).toEqual({
      stale: true,
      label: "Last verified 01/01/2026, over 180 days ago",
    });
  });
});

describe("customer forms", () => {
  const form = (o: Record<string, string>) => o;

  it("requires a customer name", () => {
    expect(parseCustomer(form({ name: "" }))).toMatchObject({
      ok: false,
      errors: { name: "Enter the customer's name." },
    });
  });

  it("parses a site with restrictions, hours and delivery windows", () => {
    const r = parseSite(
      form({
        name: "Plot 14",
        postcode: "sn14dd",
        max_vehicle_type: "7.5t",
        height_limit_m: "3.8",
        handball_allowed: "on",
        handball_people: "2",
        booking_required: "on",
        booking_lead_hours: "24",
        hours_mon_open: "07:30",
        hours_mon_close: "16:00",
        window_mon_open: "08:00",
        window_mon_close: "10:00",
      }),
    );
    expect(r.ok && r.data).toMatchObject({
      postcode: "SN1 4DD",
      max_vehicle_type: "7.5t",
      height_limit_m: 3.8,
      handball_people: 2,
      booking_lead_hours: 24,
      opening_hours: { mon: { open: "07:30", close: "16:00" }, tue: null },
      delivery_windows: { mon: { open: "08:00", close: "10:00" } },
    });
  });

  it("asks for the details that make a restriction usable", () => {
    const r = parseSite(
      form({ name: "X", postcode: "GL1 1AA", handball_allowed: "on", booking_required: "on" }),
    );
    expect(!r.ok && r.errors).toMatchObject({
      handball_people: "Say how many people are needed to handball.",
      how_to_book: "Say how to book, or how much notice they need.",
    });
  });

  it("drops details for restrictions that are switched off", () => {
    const r = parseSite(
      form({ name: "X", postcode: "GL1 1AA", handball_people: "3", booking_lead_hours: "48" }),
    );
    expect(r.ok && r.data).toMatchObject({
      handball_people: null,
      booking_lead_hours: null,
      max_vehicle_type: null,
    });
  });

  it("parses a contact with an optional site", () => {
    expect(
      parseContact(form({ name: "Jo", site_id: "none", email: "jo@example.com" })),
    ).toMatchObject({
      ok: true,
      data: { site_id: null },
    });
  });
});
