import { legBetween, type Point } from "@/lib/routing/legs";

export { AVERAGE_MPH, ROAD_FACTOR, crowMiles, roadMiles } from "@/lib/routing/legs";
import type { RuleContext } from "./context";
import { toMinutes } from "./time";

/**
 * Run times: road distances and HGV driving times from the routing provider
 * where known (ctx.legs), otherwise straight-line miles × a road factor at an
 * average speed. Plus time loading and at each stop. `roadDistances` says
 * whether every leg was a real road route, so people can be told what's an
 * estimate.
 */

export const LOADING_MINUTES = 30;
/** Minutes at each stop: a base plus a little per unit, capped. */
export const STOP_BASE_MINUTES = 20;
export const STOP_MINUTES_PER_UNIT = 2;
export const STOP_MAX_MINUTES = 60;

export function stopMinutes(units: number): number {
  return Math.min(STOP_MAX_MINUTES, STOP_BASE_MINUTES + STOP_MINUTES_PER_UNIT * units);
}

export type StopEstimate = {
  stopId: string;
  /** Estimated arrival, minutes after midnight, or null when a location is missing. */
  arrival: number | null;
  /** Planned ETA if set, else the estimate. */
  expected: number | null;
};

export type RunEstimate = {
  /** Null when any location is missing. */
  miles: number | null;
  /** True when every leg came from the routing provider. */
  roadDistances: boolean;
  drivingHours: number | null;
  dutyHours: number | null;
  stops: StopEstimate[];
};

export function estimateRun(ctx: RuleContext): RunEstimate {
  const { depot, start_time } = ctx.load;
  let clock: number | null = toMinutes(start_time);
  let at: Point = depot;
  let miles: number | null = 0;
  let drivingMinutes = 0;
  let roadDistances = true;
  let stopTime = 0;
  const stops: StopEstimate[] = [];

  for (const stop of ctx.stops) {
    const leg = legBetween(ctx.legs, at, stop.site);
    if (leg == null) {
      miles = null;
      clock = null;
    } else {
      if (leg.source === "estimate") roadDistances = false;
      if (miles != null) miles += leg.miles;
      drivingMinutes += leg.minutes;
      if (clock != null) clock += leg.minutes;
    }
    const planned = stop.booking_slot ?? stop.eta_from;
    const plannedMinutes = planned ? toMinutes(planned) : null;
    const arrival = clock;
    const expected = plannedMinutes ?? arrival;
    stops.push({ stopId: stop.id, arrival, expected });

    const units = stop.orders.flatMap((o) => o.lines).reduce((n, l) => n + l.quantity, 0);
    const minutes = stopMinutes(units);
    stopTime += minutes;
    // Waiting for a planned slot pushes the rest of the run back.
    if (clock != null) clock = Math.max(clock, plannedMinutes ?? clock) + minutes;
    at = stop.site;
  }
  const back = ctx.stops.length
    ? legBetween(ctx.legs, at, depot)
    : { miles: 0, minutes: 0, source: "road" as const };
  if (back == null) miles = null;
  else {
    if (back.source === "estimate") roadDistances = false;
    if (miles != null) miles += back.miles;
    drivingMinutes += back.minutes;
  }

  const drivingHours = miles == null ? null : drivingMinutes / 60;
  const dutyHours = drivingHours == null ? null : drivingHours + (LOADING_MINUTES + stopTime) / 60;
  return { miles, drivingHours, dutyHours, roadDistances: miles != null && roadDistances, stops };
}
