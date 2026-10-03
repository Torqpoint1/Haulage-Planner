import { legBetween, type Point } from "@/lib/routing/legs";
import type { RuleContext, RuleStop } from "@/lib/rules/context";
import { stopMinutes } from "@/lib/rules/estimate";
import { toMinutes } from "@/lib/rules/time";

/**
 * Stop order (spec 8.4): nearest stop each time from the depot, but never
 * at the cost of missing a fixed slot (a booking slot or planned arrival).
 * Without fixed slots the result is then tidied (2-opt) so the route never
 * doubles back on itself.
 */

const fixedTime = (s: RuleStop) => {
  const t = s.booking_slot ?? s.eta_from;
  return t ? toMinutes(t) : null;
};
const units = (s: RuleStop) => s.orders.flatMap((o) => o.lines).reduce((n, l) => n + l.quantity, 0);

/** Miles round the route in this order, or null when a location is missing. */
export function routeMiles(ctx: RuleContext, stops: RuleStop[]): number | null {
  const points: Point[] = [ctx.load.depot, ...stops.map((s) => s.site), ctx.load.depot];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const leg = legBetween(ctx.legs, points[i - 1], points[i]);
    if (!leg) return null;
    total += leg.miles;
  }
  return total;
}

export function nearestNeighbour(ctx: RuleContext, stops: RuleStop[]): RuleStop[] {
  const remaining = [...stops];
  const order: RuleStop[] = [];
  let at: Point = ctx.load.depot;
  let clock = toMinutes(ctx.load.start_time);
  const far = (a: Point, b: Point) =>
    legBetween(ctx.legs, a, b) ?? { miles: Infinity, minutes: Infinity };

  while (remaining.length) {
    const timed = remaining
      .filter((s) => fixedTime(s) != null)
      .sort((a, b) => fixedTime(a)! - fixedTime(b)!);
    const free = remaining
      .filter((s) => fixedTime(s) == null)
      .sort((a, b) => far(at, a.site).miles - far(at, b.site).miles);
    let next = free[0] ?? timed[0];
    if (free[0] && timed[0]) {
      // Going to the nearest free stop first must still make the next slot.
      const via =
        clock +
        far(at, free[0].site).minutes +
        stopMinutes(units(free[0])) +
        far(free[0].site, timed[0].site).minutes;
      const nearestOverall = far(at, timed[0].site).miles < far(at, free[0].site).miles;
      if (via > fixedTime(timed[0])! || nearestOverall) next = timed[0];
    }
    order.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    clock =
      Math.max(clock + far(at, next.site).minutes, fixedTime(next) ?? 0) + stopMinutes(units(next));
    at = next.site;
  }
  return order;
}

/** Reverse any stretch of the route that makes it shorter, until nothing helps. */
export function untangle(ctx: RuleContext, stops: RuleStop[]): RuleStop[] {
  let best = [...stops];
  let bestMiles = routeMiles(ctx, best);
  if (bestMiles == null) return best;
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const miles = routeMiles(ctx, next);
        if (miles != null && miles < bestMiles - 0.01) {
          best = next;
          bestMiles = miles;
          improved = true;
        }
      }
    }
  }
  // Same distance either way round: start with the stop nearest the depot.
  const reversed = [...best].reverse();
  const first = (order: RuleStop[]) =>
    legBetween(ctx.legs, ctx.load.depot, order[0].site)?.miles ?? Infinity;
  const reversedMiles = routeMiles(ctx, reversed);
  if (reversedMiles != null && reversedMiles <= bestMiles + 0.01 && first(reversed) < first(best))
    return reversed;
  return best;
}

export type StopOrderSuggestion = {
  stopIds: string[];
  miles: number;
  currentMiles: number;
  reasons: string[];
};

/** A better drop order, or null when the current one is already as good. */
export function suggestStopOrder(ctx: RuleContext): StopOrderSuggestion | null {
  if (ctx.stops.length < 2) return null;
  const greedy = nearestNeighbour(ctx, ctx.stops);
  const slotted = ctx.stops.some((s) => fixedTime(s) != null);
  const suggested = slotted ? greedy : untangle(ctx, greedy);
  if (suggested.every((s, i) => s.id === ctx.stops[i].id)) return null;
  const miles = routeMiles(ctx, suggested);
  const currentMiles = routeMiles(ctx, ctx.stops);
  if (miles == null || currentMiles == null) return null;
  const slots = suggested.filter((s) => fixedTime(s) != null);
  const saved = currentMiles - miles;
  if (saved < 0.5 && !slots.length) return null;
  const reasons = [
    slotted
      ? `Nearest stop each time from ${ctx.load.depot.name}.`
      : `Nearest stop each time from ${ctx.load.depot.name}, tidied so the route doesn't double back.`,
  ];
  if (saved >= 0.5)
    reasons.push(
      `Saves about ${saved.toFixed(1)} miles (${currentMiles.toFixed(0)} → ${miles.toFixed(0)}).`,
    );
  for (const s of slots)
    reasons.push(`Keeps the ${s.booking_slot ?? s.eta_from} slot at ${s.site.name}.`);
  return { stopIds: suggested.map((s) => s.id), miles, currentMiles, reasons };
}
