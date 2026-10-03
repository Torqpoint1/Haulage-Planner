import { formatPercent } from "@/lib/format";
import { spaceUse } from "../capacity";
import { allOrders, type RuleContext } from "../context";
import {
  listOf,
  removeOrderFix,
  switchVehicleFixes,
  unitsOf,
  vehicleLabel,
  warning,
  type Check,
} from "../helpers";

/** CAPACITY_SPACE (blocking): units exceed the vehicle's floor space or capacity. */
export const capacitySpace: Check = (ctx: RuleContext) => {
  const vehicle = ctx.load.vehicle;
  if (!vehicle) return [];
  const orders = allOrders(ctx);
  const use = spaceUse(
    orders.flatMap((o) => unitsOf(o, ctx)),
    vehicle,
  );
  if (use.share <= 1 && !use.tooBig.length) return [];

  const parts: string[] = [];
  if (use.tooBig.length) {
    parts.push(
      `${listOf(use.tooBig.map((u) => u.name))} won't fit on the deck of ${vehicleLabel(vehicle)}.`,
    );
  }
  if (use.share > 1) {
    parts.push(
      use.units
        ? `${use.units.used} ${use.units.code} on a vehicle that takes ${use.units.max}.`
        : `The units need ${formatPercent(use.share)} of the floor space of ${vehicleLabel(vehicle)}.`,
    );
  }
  const largest = [...orders].sort(
    (a, b) =>
      b.lines.reduce((n, l) => n + l.quantity, 0) - a.lines.reduce((n, l) => n + l.quantity, 0),
  )[0];
  return [
    warning(
      "CAPACITY_SPACE",
      "blocking",
      { type: "load", id: ctx.load.id },
      use.tooBig.length ? "Units don't fit the vehicle" : "Over the vehicle's space",
      parts.join(" "),
      [
        ...switchVehicleFixes(ctx, capacitySpace, "CAPACITY_SPACE"),
        ...(largest ? [removeOrderFix(largest)] : []),
      ],
    ),
  ];
};
