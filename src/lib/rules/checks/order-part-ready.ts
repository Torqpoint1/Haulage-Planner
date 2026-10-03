import { allOrders, type RuleContext } from "../context";
import { removeOrderFix, warning, type Check } from "../helpers";

/** ORDER_PART_READY (check): the order is part ready. */
export const orderPartReady: Check = (ctx: RuleContext) =>
  allOrders(ctx)
    .filter((o) => o.readiness === "part_ready")
    .map((o) =>
      warning(
        "ORDER_PART_READY",
        "check",
        { type: "order", id: o.id },
        `${o.order_ref} is part ready`,
        o.missing_items
          ? `${o.order_ref} is still missing ${o.missing_items}.`
          : `${o.order_ref} isn't all ready yet.`,
        [removeOrderFix(o)],
      ),
    );
