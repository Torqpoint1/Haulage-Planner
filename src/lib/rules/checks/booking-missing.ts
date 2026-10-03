import { plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { editStopFix, warning, type Check } from "../helpers";
import { estimateRun } from "../estimate";
import { fromMinutes, londonInstant } from "../time";

/**
 * BOOKING_MISSING: the site needs booking and the stop has no booking ref.
 * Blocking within the organisation's window (default 24 hours), a check before.
 */
export const bookingMissing: Check = (ctx: RuleContext) => {
  const estimate = estimateRun(ctx);
  return ctx.stops.flatMap((stop, i) => {
    if (!stop.site.booking_required || stop.booking_ref.trim()) return [];
    const minutes = estimate.stops[i]?.expected;
    const time = minutes == null ? ctx.load.start_time : fromMinutes(minutes);
    const hoursAway =
      (londonInstant(ctx.load.load_date, time).getTime() - ctx.now.getTime()) / 3_600_000;
    const blocking = hoursAway <= ctx.thresholds.booking_blocking_hours;
    const lead = stop.site.booking_lead_hours;
    return [
      warning(
        "BOOKING_MISSING",
        blocking ? "blocking" : "check",
        { type: "stop", id: stop.id },
        `Book in at ${stop.site.name}`,
        `${stop.site.name} needs deliveries booked in${lead ? ` at least ${plural(lead, "hour")} ahead` : ""}, and this stop has no booking reference.`,
        [editStopFix(stop, "booking", "Add booking ref")],
      ),
    ];
  });
};
