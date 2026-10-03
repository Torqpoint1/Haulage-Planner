import { formatKg } from "@/lib/format";
import type { RuleContext } from "../context";
import { listOf, switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";
import { has, tailLiftLimit, unloadOptions } from "../unloading";

/** TAIL_LIFT_WEIGHT (blocking): a unit is heavier than the tail lift and nothing else can unload it. */
export const tailLiftWeight: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle || !has(vehicle, "tail_lift")) return [];
  const limit = tailLiftLimit(vehicle);
  return ctx.stops.flatMap((stop) => {
    const heavy = stop.orders.flatMap((o) =>
      o.lines
        .filter((l) => {
          const unit = ctx.unitTypes[l.unit_type_id];
          if (!unit || l.weight_per_unit_kg <= limit) return false;
          const options = unloadOptions(unit, l.weight_per_unit_kg, vehicle, stop.site);
          return !options.forklift && !options.crane;
        })
        .map(
          (l) =>
            `${o.order_ref}: ${ctx.unitTypes[l.unit_type_id].name} at ${formatKg(l.weight_per_unit_kg)} each`,
        ),
    );
    if (!heavy.length) return [];
    return [
      warning(
        "TAIL_LIFT_WEIGHT",
        "blocking",
        { type: "stop", id: stop.id },
        "Too heavy for the tail lift",
        `${listOf(heavy)}. The tail lift on ${vehicleLabel(vehicle)} takes ${formatKg(limit)}, and ${stop.site.name} has no other way to unload it.`,
        switchVehicleFixes(ctx, tailLiftWeight, "TAIL_LIFT_WEIGHT"),
      ),
    ];
  });
};
