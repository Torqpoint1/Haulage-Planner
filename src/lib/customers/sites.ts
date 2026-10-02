import { formatDate, formatKg, formatMetres, plural } from "@/lib/format";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";

/** The site fields that affect whether and how a delivery can happen (spec 6.6). */
export type SiteRules = {
  max_vehicle_type: string | null;
  max_length_m: number | null;
  max_weight_kg: number | null;
  no_hgvs: boolean;
  height_limit_m: number | null;
  narrow_access_note: string;
  site_equipment: string[];
  handball_allowed: boolean;
  handball_people: number | null;
  crane_drop_allowed: boolean;
  booking_required: boolean;
  booking_lead_hours: number | null;
  ppe_required: boolean;
  induction_required: boolean;
  contact_must_be_present: boolean;
};

export type Restriction = {
  key: string;
  label: string;
  group: "access" | "unloading" | "booking" | "rules";
  /** Things that can stop a vehicle or delivery are a "check" (amber); the rest are neutral. */
  tone: "warning" | "neutral";
};

const EQUIPMENT_LABEL: Record<string, string> = {
  forklift: "Forklift on site",
  moffett: "Moffett on site",
  pump_truck: "Pump truck on site",
};

/** Plain-English summary of a site's restrictions, in the order a planner checks them. */
export function siteRestrictions(site: SiteRules): Restriction[] {
  const out: Restriction[] = [];
  const add = (
    key: string,
    label: string,
    group: Restriction["group"],
    tone: Restriction["tone"] = "neutral",
  ) => out.push({ key, label, group, tone });

  if (site.no_hgvs) add("no_hgvs", "No HGVs", "access", "warning");
  if (site.max_vehicle_type)
    add("max_type", `Max ${labelFor(VEHICLE_TYPES, site.max_vehicle_type)}`, "access", "warning");
  if (site.max_length_m)
    add("max_length", `Max length ${formatMetres(site.max_length_m)}`, "access", "warning");
  if (site.max_weight_kg)
    add("max_weight", `Max weight ${formatKg(site.max_weight_kg)}`, "access", "warning");
  if (site.height_limit_m)
    add("height", `Height limit ${formatMetres(site.height_limit_m)}`, "access", "warning");
  if (site.narrow_access_note.trim()) add("narrow", "Narrow access", "access", "warning");

  for (const e of site.site_equipment) add(`equipment_${e}`, EQUIPMENT_LABEL[e] ?? e, "unloading");
  if (site.handball_allowed) {
    add(
      "handball",
      site.handball_people
        ? `Handball OK (${plural(site.handball_people, "person", "people")})`
        : "Handball OK",
      "unloading",
    );
  }
  if (site.crane_drop_allowed) add("crane", "Crane drop OK", "unloading");
  if (!site.site_equipment.length && !site.handball_allowed && !site.crane_drop_allowed) {
    add("no_unload", "No unloading equipment", "unloading", "warning");
  }

  if (site.booking_required) {
    add(
      "booking",
      site.booking_lead_hours ? `Book ${site.booking_lead_hours} h ahead` : "Booking required",
      "booking",
      "warning",
    );
  }

  if (site.ppe_required) add("ppe", "PPE required", "rules");
  if (site.induction_required) add("induction", "Induction required", "rules");
  if (site.contact_must_be_present) add("contact", "Contact must be present", "rules", "warning");
  return out;
}

export type Freshness = { stale: boolean; label: string };

/**
 * Whether a site's details need checking again (spec 7.2 SITE_INFO_STALE:
 * last verified more than the organisation's staleness period ago).
 */
export function siteFreshness(
  lastVerifiedAt: string | null,
  staleDays: number,
  now = new Date(),
): Freshness {
  if (!lastVerifiedAt) return { stale: true, label: "Never verified" };
  const verified = new Date(lastVerifiedAt);
  const ageDays = Math.floor((now.getTime() - verified.getTime()) / 86_400_000);
  if (ageDays > staleDays) {
    return {
      stale: true,
      label: `Last verified ${formatDate(verified)}, over ${staleDays} days ago`,
    };
  }
  return { stale: false, label: `Verified ${formatDate(verified)}` };
}
