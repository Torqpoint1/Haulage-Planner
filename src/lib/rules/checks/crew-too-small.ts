import { plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { listOf, warning, type Check } from "../helpers";
import { handballPeople, unloadOptions } from "../unloading";

/** CREW_TOO_SMALL (check): two-person units or handballing need more crew than assigned. */
export const crewTooSmall: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  let needed = 1;
  const reasons: string[] = [];
  for (const stop of ctx.stops) {
    for (const order of stop.orders) {
      for (const line of order.lines) {
        const unit = ctx.unitTypes[line.unit_type_id];
        if (!unit) continue;
        if (unit.requires_two_people && needed < 2) {
          needed = 2;
          reasons.push(`${unit.name} needs two people to handle`);
        }
        const o = unloadOptions(unit, line.weight_per_unit_kg, vehicle, stop.site);
        if (o.handball && !o.tailLift && !o.forklift && !o.crane) {
          const people = handballPeople(stop.site);
          if (people > needed) {
            needed = people;
            reasons.push(
              `handballing at ${stop.site.name} needs ${plural(people, "person", "people")}`,
            );
          }
        }
      }
    }
  }
  if (needed <= ctx.load.crew_size) return [];
  return [
    warning(
      "CREW_TOO_SMALL",
      "check",
      { type: "load", id: ctx.load.id },
      `Crew of ${needed} needed`,
      `${listOf([...new Set(reasons)])}, but the crew is ${ctx.load.crew_size}.`.replace(
        /^./,
        (c) => c.toUpperCase(),
      ),
      [{ id: "set-crew", label: `Set crew to ${needed}`, params: { crew: needed } }],
    ),
  ];
};
