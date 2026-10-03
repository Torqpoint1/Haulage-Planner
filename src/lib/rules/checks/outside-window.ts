import type { OpeningHours } from "@/lib/settings/schemas";
import type { RuleContext } from "../context";
import { estimateRun } from "../estimate";
import { editStopFix, warning, type Check } from "../helpers";
import { dayKey, fromMinutes, toMinutes } from "../time";

const hasAny = (h: OpeningHours) => Object.values(h ?? {}).some(Boolean);

/** OUTSIDE_WINDOW (check): the planned or estimated ETA is outside opening hours or the delivery window. */
export const outsideWindow: Check = (ctx: RuleContext) => {
  const estimate = estimateRun(ctx);
  const day = dayKey(ctx.load.load_date);
  return ctx.stops.flatMap((stop, i) => {
    const eta = estimate.stops[i]?.expected;
    if (eta == null) return [];
    const windows = stop.site.delivery_windows ?? {};
    const opening = stop.site.opening_hours ?? {};
    const source = windows[day] ? "delivery window" : hasAny(opening) ? "opening hours" : null;
    if (!source) return [];
    const hours = source === "delivery window" ? windows[day] : opening[day];
    const planned = Boolean(stop.booking_slot ?? stop.eta_from);
    const when = `${planned ? "planned" : "estimated"} arrival at ${fromMinutes(eta)}`;
    if (!hours) {
      return [
        warning(
          "OUTSIDE_WINDOW",
          "check",
          { type: "stop", id: stop.id },
          `${stop.site.name} is closed that day`,
          `${stop.site.name} has no ${source} on that day of the week.`,
          [editStopFix(stop, "eta", "Set the ETA")],
        ),
      ];
    }
    if (eta >= toMinutes(hours.open) && eta <= toMinutes(hours.close)) return [];
    return [
      warning(
        "OUTSIDE_WINDOW",
        "check",
        { type: "stop", id: stop.id },
        `Arrives outside ${stop.site.name}'s ${source}`,
        `The ${when} is outside the ${source} (${hours.open}–${hours.close}).`,
        [
          editStopFix(stop, "eta", "Set the ETA"),
          { id: "edit-load", label: "Change start time", params: { field: "start_time" } },
        ],
      ),
    ];
  });
};
