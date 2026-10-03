import { formatDate, plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { warning, type Check } from "../helpers";
import { daysBetween } from "../time";

/** SITE_INFO_STALE (info): the site's details haven't been checked within the stale period (default 180 days). */
export const siteInfoStale: Check = (ctx: RuleContext) =>
  ctx.stops.flatMap((stop) => {
    const verified = stop.site.last_verified_at;
    const age = verified ? daysBetween(verified.slice(0, 10), ctx.today) : null;
    if (age != null && age <= ctx.staleDays) return [];
    return [
      warning(
        "SITE_INFO_STALE",
        "info",
        { type: "stop", id: stop.id },
        `Check ${stop.site.name}'s details`,
        verified
          ? `${stop.site.name} was last checked on ${formatDate(verified)}, ${plural(age!, "day")} ago.`
          : `${stop.site.name}'s access and unloading details have never been checked.`,
        [
          {
            id: "verify-site",
            label: "Check site details",
            params: { siteId: stop.site.id, customerId: stop.site.customer_id },
          },
        ],
      ),
    ];
  });
