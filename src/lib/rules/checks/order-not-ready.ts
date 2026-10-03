import { optionFor, READINESS } from "@/lib/orders/options";
import { allOrders, type RuleContext } from "../context";
import { date, removeOrderFix, warning, type Check } from "../helpers";

/** ORDER_NOT_READY (blocking): not ready, and the load goes before the expected ready date. */
export const orderNotReady: Check = (ctx: RuleContext) =>
  allOrders(ctx).flatMap((o) => {
    if (o.readiness === "ready") return [];
    if (o.expected_ready_date && ctx.load.load_date >= o.expected_ready_date) return [];
    const state = optionFor(READINESS, o.readiness).label.toLowerCase();
    return [
      warning(
        "ORDER_NOT_READY",
        "blocking",
        { type: "order", id: o.id },
        `${o.order_ref} won't be ready`,
        o.expected_ready_date
          ? `${o.order_ref} is ${state} and expected ready on ${date(o.expected_ready_date)}, after this load goes on ${date(ctx.load.load_date)}.`
          : `${o.order_ref} is ${state} with no expected ready date.`,
        [
          removeOrderFix(o),
          ...(o.expected_ready_date
            ? [
                {
                  id: "move-load-date",
                  label: `Move load to ${date(o.expected_ready_date)}`,
                  params: { date: o.expected_ready_date },
                },
              ]
            : []),
        ],
      ),
    ];
  });
