import { plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { editStopFix, warning, type Check } from "../helpers";
import { daysBetween } from "../time";

/** NOT_CONFIRMED (check): the delivery is close (default 2 days) and not confirmed with the customer. */
export const notConfirmed: Check = (ctx: RuleContext) => {
  if (["out", "complete"].includes(ctx.load.status)) return [];
  const days = daysBetween(ctx.today, ctx.load.load_date);
  if (days > ctx.thresholds.not_confirmed_days) return [];
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${plural(days, "day")}`;
  return ctx.stops
    .filter((s) => !s.confirmed)
    .map((stop) =>
      warning(
        "NOT_CONFIRMED",
        "check",
        { type: "stop", id: stop.id },
        `Confirm delivery with ${stop.site.name}`,
        `The delivery to ${stop.site.name} is ${when} and hasn't been confirmed with the customer.`,
        [editStopFix(stop, "confirmation", "Record confirmation")],
      ),
    );
};
