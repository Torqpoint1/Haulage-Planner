import { formatIsoDate } from "@/lib/format";
import type { PlanOrder, PlanSite, PlanVehicle } from "@/lib/planning/types";
import { runChecks, warningKey } from "@/lib/rules";
import { legBetween, type Point } from "@/lib/routing/legs";
import type { RuleContext } from "@/lib/rules/context";
import { LOADING_MINUTES, stopMinutes } from "@/lib/rules/estimate";

/**
 * Fill the gaps (spec 8.3): for a planned load with room to spare, ready
 * orders near the route that could go early or on time, with the extra miles
 * and the saving against a separate trip.
 */

export type GapFill = {
  orderId: string;
  orderRef: string;
  customer: string;
  siteName: string;
  timing: "early" | "on time";
  extraMiles: number;
  extraCost: number | null;
  saving: number | null;
  estimate: boolean;
  reasons: string[];
};

export type GapCandidate = PlanOrder & { site: PlanSite };

const money = (n: number) => Math.round(n * 100) / 100;

export function fillGaps(
  ctx: RuleContext,
  candidates: GapCandidate[],
  vehicle: PlanVehicle | null,
  maxMiles: number,
): GapFill[] {
  if (!vehicle || !ctx.stops.length) return [];
  const day = ctx.load.load_date;
  const before = new Set(
    runChecks(ctx)
      .filter((w) => w.severity === "blocking")
      .map(warningKey),
  );
  const route: Point[] = [ctx.load.depot, ...ctx.stops.map((s) => s.site), ctx.load.depot];
  const leg = (a: Point, b: Point) => legBetween(ctx.legs, a, b);
  const out: GapFill[] = [];

  for (const c of candidates) {
    if (c.readiness !== "ready" && !(c.expected_ready_date && c.expected_ready_date <= day))
      continue;
    if (c.earliest_date && day < c.earliest_date) continue;
    const deadline = c.latest_date ?? c.required_date;
    if (day > deadline) continue;
    const near = Math.min(...route.map((p) => leg(p, c.site)?.miles ?? Infinity));
    if (!(near <= maxMiles)) continue;

    // Cheapest place to slot it in: join a stop at the same site, else between two points.
    const sameSite = ctx.stops.findIndex((s) => s.site.id === c.site_id);
    let best = { miles: 0, minutes: 0, at: sameSite, estimate: false };
    if (sameSite < 0) {
      best = { miles: Infinity, minutes: 0, at: -1, estimate: false };
      for (let i = 1; i < route.length; i++) {
        const a = leg(route[i - 1], c.site);
        const b = leg(c.site, route[i]);
        const ab = leg(route[i - 1], route[i]);
        if (!a || !b || !ab) continue;
        const miles = a.miles + b.miles - ab.miles;
        if (miles < best.miles) {
          best = {
            miles,
            minutes: a.minutes + b.minutes - ab.minutes,
            at: i - 1,
            estimate: [a, b, ab].some((l) => l.source === "estimate"),
          };
        }
      }
      if (!Number.isFinite(best.miles)) continue;
    }

    // It must fit without adding a blocking warning.
    const stops = ctx.stops.map((s) => ({ ...s, orders: [...s.orders] }));
    if (sameSite >= 0) stops[sameSite].orders.push(c);
    else
      stops.splice(best.at, 0, {
        id: `gap-${c.id}`,
        sequence: 0,
        site: c.site,
        orders: [c],
        eta_from: null,
        eta_to: null,
        booking_ref: "",
        booking_slot: null,
        confirmed: false,
      });
    const after = runChecks({ ...ctx, stops }).filter(
      (w) => w.severity === "blocking" && !before.has(warningKey(w)),
    );
    if (after.length) continue;

    const qty = c.lines.reduce((n, l) => n + l.quantity, 0);
    const extraCost = money(
      best.miles * vehicle.cost_per_mile +
        ((best.minutes + (sameSite >= 0 ? 0 : stopMinutes(qty))) / 60) *
          ctx.load.crew_size *
          vehicle.cost_per_driver_hour,
    );
    const out1 = leg(ctx.load.depot, c.site);
    const back = leg(c.site, ctx.load.depot);
    const separate =
      out1 && back
        ? money(
            (out1.miles + back.miles) * vehicle.cost_per_mile +
              ((out1.minutes + back.minutes + LOADING_MINUTES + stopMinutes(qty)) / 60) *
                vehicle.cost_per_driver_hour,
          )
        : null;
    const timing = day < c.required_date ? "early" : "on time";
    out.push({
      orderId: c.id,
      orderRef: c.order_ref,
      customer: c.customer_name,
      siteName: c.site.name,
      timing,
      extraMiles: Math.max(0, best.miles),
      extraCost,
      saving: separate == null ? null : money(separate - extraCost),
      estimate: true,
      reasons: [
        `${near < 0.5 ? "On" : `${near.toFixed(1)} miles from`} the route.`,
        timing === "early"
          ? `Needed ${formatIsoDate(c.required_date)}; it's ready, so it could go early.`
          : `Due ${formatIsoDate(c.required_date)}.`,
        "Fits without a blocking warning.",
      ],
    });
  }
  return out.sort((a, b) => (b.saving ?? -Infinity) - (a.saving ?? -Infinity)).slice(0, 5);
}
