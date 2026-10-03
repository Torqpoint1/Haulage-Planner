import "server-only";
import { distanceMatrix, routeThrough } from "@/lib/services/routing";
import { createClient } from "@/lib/supabase/server";
import { legKey, pairsAlong, pointKey, type Legs, type Point } from "./legs";

type Row = {
  from_key: string;
  to_key: string;
  miles: number;
  minutes: number;
  geometry: [number, number][] | null;
};

const located = (p: Point) => pointKey(p) != null;

/** Cached legs for the given pairs, keyed by legKey. */
async function cached(pairs: [Point, Point][]): Promise<Legs> {
  const wanted = new Set(
    pairs.map(([a, b]) => legKey(a, b)).filter((k): k is string => Boolean(k)),
  );
  if (!wanted.size) return {};
  const froms = [...new Set([...wanted].map((k) => k.split("|")[0]))];
  const tos = [...new Set([...wanted].map((k) => k.split("|")[1]))];
  const supabase = await createClient();
  const { data } = await supabase
    .from("route_legs")
    .select("from_key, to_key, miles, minutes, geometry")
    .in("from_key", froms)
    .in("to_key", tos);
  const out: Legs = {};
  for (const r of (data ?? []) as Row[]) {
    const key = `${r.from_key}|${r.to_key}`;
    if (wanted.has(key)) {
      out[key] = {
        miles: Number(r.miles),
        minutes: Number(r.minutes),
        source: "road",
        geometry: r.geometry,
      };
    }
  }
  return out;
}

async function store(
  rows: {
    from: Point;
    to: Point;
    miles: number;
    minutes: number;
    geometry?: [number, number][] | null;
  }[],
) {
  if (!rows.length) return;
  const supabase = await createClient();
  // Best effort: a failed cache write only means asking the provider again next time.
  await supabase.from("route_legs").upsert(
    rows.map((r) => ({
      from_key: pointKey(r.from),
      to_key: pointKey(r.to),
      miles: Math.round(r.miles * 100) / 100,
      minutes: Math.round(r.minutes * 10) / 10,
      geometry: r.geometry ?? null,
    })),
    { onConflict: "organisation_id,from_key,to_key" },
  );
}

/** At most this many provider calls per page, so a slow service can't stall the board. */
const MAX_ROUTE_CALLS = 12;

/**
 * Road legs (with shapes) along each route, from the cache or the routing
 * provider. Pairs that can't be routed are simply missing; callers fall back
 * to the estimate.
 */
export async function routeLegs(routes: Point[][]): Promise<Legs> {
  const usable = routes.filter((r) => r.length > 1 && r.every(located));
  const legs = await cached(usable.flatMap(pairsAlong));
  let calls = 0;
  const fresh: Parameters<typeof store>[0] = [];
  for (const route of usable) {
    const pairs = pairsAlong(route);
    // Matrix results have no shape; routes are fetched again once to draw them.
    if (
      pairs.every(([a, b]) => legs[legKey(a, b)!]?.geometry?.length || pointKey(a) === pointKey(b))
    )
      continue;
    if (calls >= MAX_ROUTE_CALLS) break;
    calls += 1;
    const result = await routeThrough(route);
    if (!result) break; // The provider is unavailable; don't keep trying this request.
    result.legs.forEach((leg, i) => {
      const [a, b] = pairs[i];
      legs[legKey(a, b)!] = { ...leg, source: "road" };
      fresh.push({ from: a, to: b, ...leg });
    });
  }
  await store(fresh);
  return legs;
}

/** Road legs between every pair of points (for suggestions), from the cache or one matrix call. */
export async function matrixLegs(points: Point[]): Promise<Legs> {
  const unique = [...new Map(points.filter(located).map((p) => [pointKey(p)!, p])).values()];
  const pairs = unique.flatMap((a) =>
    unique.filter((b) => b !== a).map((b) => [a, b] as [Point, Point]),
  );
  const legs = await cached(pairs);
  if (pairs.every(([a, b]) => legs[legKey(a, b)!])) return legs;
  const matrix = await distanceMatrix(unique);
  if (!matrix) return legs;
  const fresh: Parameters<typeof store>[0] = [];
  unique.forEach((a, i) =>
    unique.forEach((b, j) => {
      const miles = matrix.miles[i][j];
      const minutes = matrix.minutes[i][j];
      if (i === j || miles == null || minutes == null) return;
      const key = legKey(a, b)!;
      if (!legs[key]) {
        legs[key] = { miles, minutes, source: "road" };
        fresh.push({ from: a, to: b, miles, minutes });
      }
    }),
  );
  await store(fresh);
  return legs;
}
