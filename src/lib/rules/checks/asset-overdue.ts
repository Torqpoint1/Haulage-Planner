import { plural } from "@/lib/format";
import type { RuleContext } from "../context";
import { listOf, warning, type Check } from "../helpers";

/** ASSET_OVERDUE (info): returnable assets at a stop's site are past their expected return date. */
export const assetOverdue: Check = (ctx: RuleContext) =>
  ctx.stops.flatMap((stop) => {
    const overdue = ctx.assets.filter(
      (a) =>
        a.site_id === stop.site.id &&
        a.expected_return_date != null &&
        a.expected_return_date < ctx.today,
    );
    if (!overdue.length) return [];
    return [
      warning(
        "ASSET_OVERDUE",
        "info",
        { type: "stop", id: stop.id },
        `${plural(overdue.length, "asset")} to collect at ${stop.site.name}`,
        `${listOf(overdue.map((a) => `${a.unit_type_name} ${a.asset_number}`))} ${overdue.length === 1 ? "is" : "are"} overdue back from ${stop.site.name}.`,
      ),
    ];
  });
