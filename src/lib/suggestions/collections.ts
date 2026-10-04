import { formatIsoDate, fromIsoDate, plural } from "@/lib/format";
import type { PlanAsset, PlanSite } from "@/lib/planning/types";
import { legBetween, type Point } from "@/lib/routing/legs";
import type { RuleContext } from "@/lib/rules/context";

/**
 * Asset collections (spec 8.5): when a load passes within X miles of a site
 * holding overdue returnable assets, suggest adding a collection stop. Only
 * proposes; adding the stop is a separate click.
 */

export type CollectionSuggestion = {
  siteId: string;
  siteName: string;
  postcode: string;
  assets: { id: string; label: string; daysOverdue: number }[];
  /** 0 when the load already stops there. */
  extraMiles: number;
  estimate: boolean;
  onRoute: boolean;
  reasons: string[];
};

const daysBetween = (from: string, to: string) =>
  Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);

export function assetCollections(
  ctx: RuleContext,
  assets: PlanAsset[],
  sites: Record<string, PlanSite>,
  maxMiles: number,
  /** Assets already planned for collection on any load. */
  plannedIds: Set<string>,
): CollectionSuggestion[] {
  const overdue = assets.filter(
    (a) =>
      a.status === "at_customer" &&
      a.site_id &&
      a.expected_return_date != null &&
      a.expected_return_date < ctx.today &&
      !plannedIds.has(a.id),
  );
  if (!overdue.length) return [];
  const route: Point[] = [ctx.load.depot, ...ctx.stops.map((s) => s.site), ctx.load.depot];
  const leg = (a: Point, b: Point) => legBetween(ctx.legs, a, b);

  const bySite = new Map<string, PlanAsset[]>();
  for (const a of overdue) bySite.set(a.site_id!, [...(bySite.get(a.site_id!) ?? []), a]);

  const out: CollectionSuggestion[] = [];
  for (const [siteId, held] of bySite) {
    const site = sites[siteId];
    if (!site) continue;
    const onRoute = ctx.stops.some((s) => s.site.id === siteId);
    let extra = { miles: 0, estimate: false };
    let near = 0;
    if (!onRoute) {
      near = Math.min(...route.map((p) => leg(p, site)?.miles ?? Infinity));
      if (!(near <= maxMiles)) continue;
      extra = { miles: Infinity, estimate: false };
      for (let i = 1; i < route.length; i++) {
        const a = leg(route[i - 1], site);
        const b = leg(site, route[i]);
        const ab = leg(route[i - 1], route[i]);
        if (!a || !b || !ab) continue;
        const miles = a.miles + b.miles - ab.miles;
        if (miles < extra.miles) {
          extra = { miles, estimate: [a, b, ab].some((l) => l.source === "estimate") };
        }
      }
      if (!Number.isFinite(extra.miles)) continue;
    }
    const list = held
      .map((a) => ({
        id: a.id,
        label: `${a.unit_type_name} ${a.asset_number}`,
        daysOverdue: daysBetween(a.expected_return_date!, ctx.today),
        due: a.expected_return_date!,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue || a.label.localeCompare(b.label));
    const oldest = list[0];
    out.push({
      siteId,
      siteName: site.name,
      postcode: site.postcode,
      assets: list.map(({ id, label, daysOverdue }) => ({ id, label, daysOverdue })),
      extraMiles: Math.max(0, extra.miles),
      estimate: extra.estimate,
      onRoute,
      reasons: [
        onRoute
          ? `This load already stops at ${site.name}.`
          : `${near < 0.5 ? "On" : `${near.toFixed(1)} miles from`} the route.`,
        `${plural(list.length, "asset")} overdue; the oldest was due back ${formatIsoDate(oldest.due)} (${plural(oldest.daysOverdue, "day")} ago).`,
      ],
    });
  }
  return out.sort((a, b) => a.extraMiles - b.extraMiles || b.assets.length - a.assets.length);
}
