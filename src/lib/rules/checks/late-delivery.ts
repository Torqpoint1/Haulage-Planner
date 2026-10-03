import { allOrders, type RuleContext } from "../context";
import { date, removeOrderFix, warning, type Check } from "../helpers";

/** LATE_DELIVERY (check): the load goes after the order's required date (or its latest date, if set). */
export const lateDelivery: Check = (ctx: RuleContext) =>
  allOrders(ctx).flatMap((o) => {
    const deadline = o.latest_date ?? o.required_date;
    if (ctx.load.load_date <= deadline) return [];
    return [
      warning(
        "LATE_DELIVERY",
        "check",
        { type: "order", id: o.id },
        `${o.order_ref} will be late`,
        o.latest_date
          ? `${o.order_ref} must arrive by ${date(o.latest_date)} at the latest; this load goes on ${date(ctx.load.load_date)}.`
          : `${o.order_ref} is needed on ${date(o.required_date)}; this load goes on ${date(ctx.load.load_date)}.`,
        [removeOrderFix(o)],
      ),
    ];
  });
