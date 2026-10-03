import { date, switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";
import type { RuleContext, RuleVehicle, RuleZone } from "../context";

/** "GL5 3QF" → "GL5"; its area is the leading letters. */
const outward = (postcode: string) => postcode.trim().toUpperCase().split(/\s+/)[0];
const areaOf = (district: string) => district.replace(/[0-9].*$/, "");

export function zonesFor(postcode: string, zones: RuleZone[]): RuleZone[] {
  const district = outward(postcode);
  const area = areaOf(district);
  return zones.filter((z) => z.postcode_districts.some((d) => d === district || d === area));
}

const isEuro6 = (standard: string) => /\b(6|VI)\b/i.test(standard);

/** What's wrong with this vehicle in this zone on this date, or null if it's fine or exempt. */
export function zoneProblem(z: RuleZone, v: RuleVehicle, day: string): string | null {
  if (z.min_gross_kg != null && v.gross_weight_kg < z.min_gross_kg) return null;
  if (z.max_gross_kg != null && v.gross_weight_kg > z.max_gross_kg) return null;
  switch (z.requirement) {
    case "euro_6":
      return isEuro6(v.euro_standard)
        ? null
        : `needs a Euro 6 engine (${v.euro_standard || "not recorded"})`;
    case "caz_compliant":
      return v.caz_compliant ? null : "isn't marked clean air zone compliant";
    case "hgv_permit":
      if (!v.london_hgv_permit) return "has no London HGV Safety Permit";
      if (v.london_hgv_permit_expires && v.london_hgv_permit_expires < day) {
        return `has a London HGV Safety Permit that expired on ${date(v.london_hgv_permit_expires)}`;
      }
      return null;
  }
}

/** ZONE_COMPLIANCE (check): the vehicle isn't compliant for a zone a stop falls in. */
export const zoneCompliance: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  return ctx.stops.flatMap((stop) => {
    const problems = zonesFor(stop.site.postcode, ctx.zones)
      .map((z) => ({ z, problem: zoneProblem(z, vehicle, ctx.load.load_date) }))
      .filter((p): p is { z: RuleZone; problem: string } => Boolean(p.problem));
    if (!problems.length) return [];
    return [
      warning(
        "ZONE_COMPLIANCE",
        "check",
        { type: "stop", id: stop.id },
        `${problems.map((p) => p.z.name).join(", ")}`,
        `${stop.site.name} (${stop.site.postcode}) is in ${problems.map((p) => `the ${p.z.name}: ${vehicleLabel(vehicle)} ${p.problem}`).join("; ")}.`,
        switchVehicleFixes(ctx, zoneCompliance, "ZONE_COMPLIANCE"),
      ),
    ];
  });
};
