import type { RuleContext } from "../context";
import { listOf, switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";
import { siteHasForklift, tailLiftOnly } from "../unloading";

/** UPRIGHT_TAIL_LIFT (blocking): upright units, tail lift only, no forklift or handballing at the site. */
export const uprightTailLift: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle || !tailLiftOnly(vehicle)) return [];
  return ctx.stops.flatMap((stop) => {
    if (siteHasForklift(stop.site) || stop.site.handball_allowed) return [];
    const upright = stop.orders.flatMap((o) =>
      o.lines
        .filter((l) => ctx.unitTypes[l.unit_type_id]?.must_stay_upright)
        .map((l) => `${o.order_ref}: ${l.quantity} × ${ctx.unitTypes[l.unit_type_id].name}`),
    );
    if (!upright.length) return [];
    return [
      warning(
        "UPRIGHT_TAIL_LIFT",
        "blocking",
        { type: "stop", id: stop.id },
        "Upright units can't come off by tail lift here",
        `${listOf(upright)} must travel upright. ${vehicleLabel(vehicle)} only has a tail lift, and ${stop.site.name} has no forklift and doesn't allow handballing.`,
        switchVehicleFixes(ctx, uprightTailLift, "UPRIGHT_TAIL_LIFT"),
      ),
    ];
  });
};
