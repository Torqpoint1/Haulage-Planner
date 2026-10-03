import type { RuleContext } from "./context";
import { toMinutes } from "./time";

/**
 * Run estimates until road routing arrives (Stage 6): straight-line miles
 * × a road factor, at an average speed, plus time at each stop. Always
 * shown to people as an estimate.
 */

export const ROAD_FACTOR = 1.3;
export const AVERAGE_MPH = 30;
/** Minutes at the depot loading before the run (counts towards duty). */
export const LOADING_MINUTES = 30;
/** Minutes at each stop: a base plus a little per unit, capped. */
export const STOP_BASE_MINUTES = 20;
export const STOP_MINUTES_PER_UNIT = 2;
export const STOP_MAX_MINUTES = 60;

type Point = { latitude: number | null; longitude: number | null };

/** Straight-line miles between two points (haversine). */
export function crowMiles(a: Point, b: Point): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export const roadMiles = (a: Point, b: Point) => {
  const crow = crowMiles(a, b);
  return crow == null ? null : crow * ROAD_FACTOR;
};

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
  drivingHours: number | null;
  dutyHours: number | null;
  stops: StopEstimate[];
};

export function estimateRun(ctx: RuleContext): RunEstimate {
  const { depot, start_time } = ctx.load;
  let clock: number | null = toMinutes(start_time);
  let at: Point = depot;
  let miles: number | null = 0;
  let stopTime = 0;
  const stops: StopEstimate[] = [];

  for (const stop of ctx.stops) {
    const leg = roadMiles(at, stop.site);
    if (leg == null) {
      miles = null;
      clock = null;
    } else {
      if (miles != null) miles += leg;
      if (clock != null) clock += (leg / AVERAGE_MPH) * 60;
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
  const back = ctx.stops.length ? roadMiles(at, depot) : 0;
  if (back == null) miles = null;
  else if (miles != null) miles += back;

  const drivingHours = miles == null ? null : miles / AVERAGE_MPH;
  const dutyHours = drivingHours == null ? null : drivingHours + (LOADING_MINUTES + stopTime) / 60;
  return { miles, drivingHours, dutyHours, stops };
}
