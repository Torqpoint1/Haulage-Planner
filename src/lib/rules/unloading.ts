import type { RuleSite, RuleUnitType, RuleVehicle } from "./context";

/**
 * Which ways a unit can come off a vehicle at a site (spec 7.2). Kept in one
 * place so the unloading checks agree with each other.
 */

export const DEFAULT_TAIL_LIFT_KG = 750;
/** What one person can reasonably lift down by hand. */
export const HANDBALL_KG_PER_PERSON = 25;

export const has = (v: RuleVehicle, method: string) => v.unload_methods.includes(method);

export const siteHasForklift = (site: RuleSite) =>
  site.site_equipment.includes("forklift") || site.site_equipment.includes("moffett");

export const tailLiftLimit = (v: RuleVehicle) => v.tail_lift_max_kg ?? DEFAULT_TAIL_LIFT_KG;

export const handballPeople = (site: RuleSite) => site.handball_people ?? 2;

/** The vehicle can only unload by tail lift (no side, rear or crane access). */
export const tailLiftOnly = (v: RuleVehicle) =>
  has(v, "tail_lift") && v.unload_methods.every((m) => m === "tail_lift");

export type UnloadOptions = {
  tailLift: boolean;
  forklift: boolean;
  crane: boolean;
  handball: boolean;
};

export function unloadOptions(
  unit: RuleUnitType,
  weightKg: number,
  vehicle: RuleVehicle,
  site: RuleSite,
): UnloadOptions {
  const min = unit.min_unload_method;
  const tailLiftCarries = has(vehicle, "tail_lift") && weightKg <= tailLiftLimit(vehicle);
  return {
    tailLift: min === "any" && tailLiftCarries && !unit.must_stay_upright,
    forklift:
      (min === "any" || min === "forklift") &&
      siteHasForklift(site) &&
      ["tail_lift", "side", "rear"].some((m) => has(vehicle, m)),
    crane:
      (min === "any" || min === "crane") &&
      has(vehicle, "crane") &&
      site.crane_drop_allowed &&
      weightKg <= (vehicle.crane_max_kg ?? Infinity),
    handball:
      min === "any" &&
      site.handball_allowed &&
      (tailLiftCarries || weightKg <= HANDBALL_KG_PER_PERSON * handballPeople(site)),
  };
}

export const anyOption = (o: UnloadOptions) => o.tailLift || o.forklift || o.crane || o.handball;
