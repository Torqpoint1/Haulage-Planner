import { plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { listOf, vehicleLabel, warning, type Check } from "../helpers";
import { handballPeople, siteHasForklift, tailLiftOnly } from "../unloading";

/** UPRIGHT_HANDBALL (check): as UPRIGHT_TAIL_LIFT, but the site allows handballing. */
export const uprightHandball: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle || !tailLiftOnly(vehicle)) return [];
  return ctx.stops.flatMap((stop) => {
    if (siteHasForklift(stop.site) || !stop.site.handball_allowed) return [];
    const upright = stop.orders.flatMap((o) =>
      o.lines
        .filter((l) => ctx.unitTypes[l.unit_type_id]?.must_stay_upright)
        .map((l) => `${l.quantity} × ${ctx.unitTypes[l.unit_type_id].name}`),
    );
    if (!upright.length) return [];
    const people = handballPeople(stop.site);
    const fixes =
      ctx.load.crew_size < people
        ? [{ id: "set-crew", label: `Set crew to ${people}`, params: { crew: people } }]
        : [];
    return [
      warning(
        "UPRIGHT_HANDBALL",
        "check",
        { type: "stop", id: stop.id },
        `Handball at ${stop.site.name}: ${plural(people, "person", "people")} needed`,
        `${listOf(upright)} must stay upright and ${vehicleLabel(vehicle)} only has a tail lift, so they'll be handballed off at ${stop.site.name}. That needs ${plural(people, "person", "people")}.`,
        fixes,
      ),
    ];
  });
};
