import type { RuleContext } from "../context";
import { listOf, switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";
import {
  anyOption,
  has,
  siteHasForklift,
  tailLiftLimit,
  tailLiftOnly,
  unloadOptions,
} from "../unloading";

/**
 * NO_UNLOAD_METHOD (blocking): no combination of vehicle method and site
 * equipment works. Units already explained by UPRIGHT_TAIL_LIFT or
 * TAIL_LIFT_WEIGHT aren't repeated here.
 */
export const noUnloadMethod: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  return ctx.stops.flatMap((stop) => {
    const stuck = stop.orders.flatMap((o) =>
      o.lines
        .filter((l) => {
          const unit = ctx.unitTypes[l.unit_type_id];
          if (!unit) return false;
          if (anyOption(unloadOptions(unit, l.weight_per_unit_kg, vehicle, stop.site)))
            return false;
          const explainedUpright =
            unit.must_stay_upright && tailLiftOnly(vehicle) && !siteHasForklift(stop.site);
          const explainedWeight =
            has(vehicle, "tail_lift") && l.weight_per_unit_kg > tailLiftLimit(vehicle);
          return !explainedUpright && !explainedWeight;
        })
        .map((l) => `${o.order_ref}: ${ctx.unitTypes[l.unit_type_id].name}`),
    );
    if (!stuck.length) return [];
    return [
      warning(
        "NO_UNLOAD_METHOD",
        "blocking",
        { type: "stop", id: stop.id },
        `No way to unload at ${stop.site.name}`,
        `${listOf(stuck)} can't be unloaded: nothing on ${vehicleLabel(vehicle)} matches the equipment at ${stop.site.name}.`,
        switchVehicleFixes(ctx, noUnloadMethod, "NO_UNLOAD_METHOD"),
      ),
    ];
  });
};
