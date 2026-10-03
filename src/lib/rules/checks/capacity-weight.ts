import { formatKg, formatPercent } from "@/lib/format";
import { totalWeight } from "../capacity";
import { allOrders, type RuleContext } from "../context";
import { removeOrderFix, switchVehicleFixes, vehicleLabel, warning, type Check } from "../helpers";

/** CAPACITY_WEIGHT: blocking over payload; a check from the organisation's near-limit share. */
export const capacityWeight: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  const orders = allOrders(ctx);
  const weight = totalWeight(orders.flatMap((o) => o.lines));
  const near = ctx.thresholds.capacity_near_limit_pct / 100;
  const share = weight / vehicle.payload_kg;
  if (share < near) return [];
  const over = weight > vehicle.payload_kg;
  const heaviest = [...orders].sort((a, b) => totalWeight(b.lines) - totalWeight(a.lines))[0];
  return [
    warning(
      "CAPACITY_WEIGHT",
      over ? "blocking" : "check",
      { type: "load", id: ctx.load.id },
      over ? "Over the vehicle's payload" : "Close to the vehicle's payload",
      over
        ? `${formatKg(Math.round(weight))} on ${vehicleLabel(vehicle)}, which can carry ${formatKg(vehicle.payload_kg)}: ${formatKg(Math.round(weight - vehicle.payload_kg))} too heavy.`
        : `${formatKg(Math.round(weight))} is ${formatPercent(share)} of the ${formatKg(vehicle.payload_kg)} payload of ${vehicleLabel(vehicle)}.`,
      [
        ...switchVehicleFixes(ctx, capacityWeight, "CAPACITY_WEIGHT"),
        ...(over && heaviest ? [removeOrderFix(heaviest)] : []),
      ],
    ),
  ];
};
