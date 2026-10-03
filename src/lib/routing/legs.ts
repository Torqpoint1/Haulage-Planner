/**
 * Road distances between points (spec 4). A leg is either a road route from
 * the routing provider or, when that isn't available, an estimate from the
 * straight-line distance × 1.3. Shared by the server and the browser.
 */

export type Point = { latitude: number | null; longitude: number | null };

/** Fallback when road routing isn't available: straight line × 1.3 (spec 4) at 30 mph. */
export const ROAD_FACTOR = 1.3;
export const AVERAGE_MPH = 30;

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

export type Leg = {
  miles: number;
  minutes: number;
  source: "road" | "estimate";
  /** [[lat, lng], …] when the provider gave a route shape. */
  geometry?: [number, number][] | null;
};

export type Legs = Record<string, Leg>;

/** "51.73602,-2.22381": rounded so the same place always gives the same key. */
export const pointKey = (p: Point) =>
  p.latitude == null || p.longitude == null
    ? null
    : `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;

export const legKey = (a: Point, b: Point) => {
  const from = pointKey(a);
  const to = pointKey(b);
  return from && to ? `${from}|${to}` : null;
};

export function estimateLeg(a: Point, b: Point): Leg | null {
  const crow = crowMiles(a, b);
  if (crow == null) return null;
  const miles = crow * ROAD_FACTOR;
  return { miles, minutes: (miles / AVERAGE_MPH) * 60, source: "estimate" };
}

/** A leg from the known legs, else an estimate; null only when a location is missing. */
export function legBetween(legs: Legs | undefined, a: Point, b: Point): Leg | null {
  const key = legKey(a, b);
  if (key && legs?.[key]) return legs[key];
  if (pointKey(a) && pointKey(a) === pointKey(b)) return { miles: 0, minutes: 0, source: "road" };
  return estimateLeg(a, b);
}

/** Consecutive pairs along a route. */
export const pairsAlong = (points: Point[]) =>
  points.slice(1).map((p, i) => [points[i], p] as [Point, Point]);
