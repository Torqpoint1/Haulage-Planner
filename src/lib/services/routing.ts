import type { Point } from "@/lib/routing/legs";

/**
 * Road routing (spec 4): OpenRouteService with the HGV profile. Behind this
 * small module so the provider can be swapped. Nothing here throws: if the
 * service is slow, down or not configured, callers get null and fall back to
 * the labelled straight-line estimate (spec 12).
 */

type Fetch = typeof fetch;
const TIMEOUT_MS = 4000;
const METRES_PER_MILE = 1609.344;
/** ORS allows up to 50 waypoints per route and 3,500 matrix cells on the free plan. */
export const MAX_WAYPOINTS = 50;
export const MAX_MATRIX_POINTS = 50;

export function routingConfigured() {
  return Boolean(process.env.ORS_API_KEY || process.env.ORS_API_URL);
}

function endpoint(path: string) {
  return `${process.env.ORS_API_URL ?? "https://api.openrouteservice.org"}${path}`;
}

const coords = (points: Point[]) => points.map((p) => [p.longitude!, p.latitude!]);

async function post(path: string, body: unknown, fetchImpl: Fetch) {
  const response = await fetchImpl(endpoint(path), {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      accept: "application/json, application/geo+json",
      ...(process.env.ORS_API_KEY ? { authorization: process.env.ORS_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return response.json();
}

export type RouteResult = {
  legs: { miles: number; minutes: number; geometry: [number, number][] }[];
};

/** A road route through the points in order, with each leg's distance, time and shape. */
export async function routeThrough(
  points: Point[],
  fetchImpl: Fetch = fetch,
): Promise<RouteResult | null> {
  if (!routingConfigured() || points.length < 2 || points.length > MAX_WAYPOINTS) return null;
  try {
    const body = (await post(
      "/v2/directions/driving-hgv/geojson",
      { coordinates: coords(points) },
      fetchImpl,
    )) as {
      features?: {
        geometry?: { coordinates?: [number, number][] };
        properties?: { segments?: { distance: number; duration: number }[]; way_points?: number[] };
      }[];
    } | null;
    const feature = body?.features?.[0];
    const segments = feature?.properties?.segments;
    const line = feature?.geometry?.coordinates ?? [];
    const waypoints = feature?.properties?.way_points ?? [];
    if (!segments || segments.length !== points.length - 1) return null;
    return {
      legs: segments.map((s, i) => ({
        miles: s.distance / METRES_PER_MILE,
        minutes: s.duration / 60,
        geometry: line
          .slice(waypoints[i] ?? 0, (waypoints[i + 1] ?? line.length - 1) + 1)
          .map(([lng, lat]) => [lat, lng] as [number, number]),
      })),
    };
  } catch {
    return null;
  }
}

export type MatrixResult = { miles: (number | null)[][]; minutes: (number | null)[][] };

/** Road distance and time between every pair of points. */
export async function distanceMatrix(
  points: Point[],
  fetchImpl: Fetch = fetch,
): Promise<MatrixResult | null> {
  if (!routingConfigured() || points.length < 2 || points.length > MAX_MATRIX_POINTS) return null;
  try {
    const body = (await post(
      "/v2/matrix/driving-hgv",
      { locations: coords(points), metrics: ["distance", "duration"] },
      fetchImpl,
    )) as { distances?: (number | null)[][]; durations?: (number | null)[][] } | null;
    if (!body?.distances || !body.durations) return null;
    return {
      miles: body.distances.map((row) => row.map((m) => (m == null ? null : m / METRES_PER_MILE))),
      minutes: body.durations.map((row) => row.map((s) => (s == null ? null : s / 60))),
    };
  } catch {
    return null;
  }
}
