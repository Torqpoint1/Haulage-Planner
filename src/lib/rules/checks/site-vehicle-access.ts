import { formatKg, formatMetres } from "@/lib/format";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import type { RuleContext, RuleSite, RuleVehicle } from "../context";
import { switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";

/** The heaviest gross weight each weight-based vehicle type stands for. */
const TYPE_MAX_GROSS: Record<string, number> = {
  van: 3500,
  luton: 3500,
  "7.5t": 7500,
  "12t": 12000,
  "18t": 18000,
  "26t": 26000,
  artic: 44000,
};
/** Anything over 3.5 tonnes counts as an HGV. */
export const HGV_KG = 3500;

export function accessProblems(v: RuleVehicle, site: RuleSite): string[] {
  const out: string[] = [];
  if (site.no_hgvs && v.gross_weight_kg > HGV_KG) out.push("the site is no HGVs");
  if (site.max_length_m != null && v.overall_length_m > site.max_length_m) {
    out.push(
      `it's ${formatMetres(v.overall_length_m)} long and the site takes ${formatMetres(site.max_length_m)}`,
    );
  }
  if (site.max_weight_kg != null && v.gross_weight_kg > site.max_weight_kg) {
    out.push(
      `it weighs up to ${formatKg(v.gross_weight_kg)} and the site takes ${formatKg(site.max_weight_kg)}`,
    );
  }
  const typeLimit = site.max_vehicle_type ? TYPE_MAX_GROSS[site.max_vehicle_type] : undefined;
  if (typeLimit && v.gross_weight_kg > typeLimit) {
    out.push(`the largest vehicle allowed is a ${labelFor(VEHICLE_TYPES, site.max_vehicle_type!)}`);
  }
  return out;
}

/** SITE_VEHICLE_ACCESS (blocking): the vehicle breaks the site's length, weight, type or HGV rules. */
export const siteVehicleAccess: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  return ctx.stops.flatMap((stop) => {
    const problems = accessProblems(vehicle, stop.site);
    if (!problems.length) return [];
    return [
      warning(
        "SITE_VEHICLE_ACCESS",
        "blocking",
        { type: "stop", id: stop.id },
        `${vehicle.name} can't get into ${stop.site.name}`,
        `${vehicleLabel(vehicle)} can't deliver to ${stop.site.name}: ${problems.join("; ")}.`,
        switchVehicleFixes(ctx, siteVehicleAccess, "SITE_VEHICLE_ACCESS"),
      ),
    ];
  });
};
