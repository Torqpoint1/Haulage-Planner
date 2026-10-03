import { describe, expect, it } from "vitest";
import { driverHours } from "@/lib/rules/checks/driver-hours";
import { estimateRun } from "@/lib/rules/estimate";
import { context, site, stop } from "@/lib/rules/__tests__/fixtures";
import { distanceMatrix, routeThrough } from "@/lib/services/routing";
import { legBetween, legKey, pairsAlong, pointKey } from "../legs";

const depot = { latitude: 51.736, longitude: -2.224 };
const yard = { latitude: 51.86142, longitude: -2.24412 };

describe("legs", () => {
  it("keys points to 5 decimal places and refuses missing locations", () => {
    expect(pointKey(yard)).toBe("51.86142,-2.24412");
    expect(pointKey({ latitude: null, longitude: 1 })).toBeNull();
    expect(legKey(depot, yard)).toBe("51.73600,-2.22400|51.86142,-2.24412");
  });

  it("uses a known road leg, else an estimate", () => {
    const road = { miles: 11.2, minutes: 24, source: "road" as const };
    expect(legBetween({ [legKey(depot, yard)!]: road }, depot, yard)).toBe(road);
    const est = legBetween({}, depot, yard)!;
    expect(est.source).toBe("estimate");
    expect(est.miles).toBeCloseTo(8.7 * 1.3, 0);
    expect(legBetween({}, depot, { latitude: null, longitude: null })).toBeNull();
    expect(pairsAlong([depot, yard, depot])).toHaveLength(2);
  });

  it("feeds road legs into the run estimate and says so", () => {
    const ctx = context({ stops: [stop({ site: site({ ...yard }) })] });
    expect(estimateRun(ctx).roadDistances).toBe(false);
    ctx.legs = {
      [legKey(ctx.load.depot, yard)!]: { miles: 12, minutes: 30, source: "road" },
      [legKey(yard, ctx.load.depot)!]: { miles: 13, minutes: 32, source: "road" },
    };
    const run = estimateRun(ctx);
    expect(run.roadDistances).toBe(true);
    expect(run.miles).toBe(25);
    expect(run.drivingHours).toBeCloseTo(62 / 60);
    ctx.thresholds.driver_max_driving_hours = 1;
    expect(driverHours(ctx)[0].detail).toMatch(/^Road route: about 1\.0 hours driving/);
  });
});

describe("routing service", () => {
  const fakeFetch = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("does nothing unless configured", async () => {
    delete process.env.ORS_API_URL;
    delete process.env.ORS_API_KEY;
    expect(await routeThrough([depot, yard], fakeFetch({}))).toBeNull();
  });

  it("splits a route into legs with shapes, in miles and minutes", async () => {
    process.env.ORS_API_URL = "http://ors.test";
    const result = await routeThrough(
      [depot, yard, depot],
      fakeFetch({
        features: [
          {
            geometry: {
              coordinates: [
                [-2.224, 51.736],
                [-2.23, 51.8],
                [-2.244, 51.861],
                [-2.224, 51.736],
              ],
            },
            properties: {
              segments: [
                { distance: 16093.44, duration: 1200 },
                { distance: 8046.72, duration: 600 },
              ],
              way_points: [0, 2, 3],
            },
          },
        ],
      }),
    );
    expect(result!.legs[0]).toMatchObject({ miles: 10, minutes: 20 });
    expect(result!.legs[0].geometry).toEqual([
      [51.736, -2.224],
      [51.8, -2.23],
      [51.861, -2.244],
    ]);
    expect(result!.legs[1]).toMatchObject({ miles: 5, minutes: 10 });
    delete process.env.ORS_API_URL;
  });

  it("returns null on errors or odd answers instead of throwing", async () => {
    process.env.ORS_API_URL = "http://ors.test";
    expect(await routeThrough([depot, yard], fakeFetch({}, false))).toBeNull();
    expect(await routeThrough([depot, yard], fakeFetch({ features: [] }))).toBeNull();
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await distanceMatrix([depot, yard], boom)).toBeNull();
    const matrix = await distanceMatrix(
      [depot, yard],
      fakeFetch({
        distances: [
          [0, 1609.344],
          [3218.688, 0],
        ],
        durations: [
          [0, 60],
          [120, 0],
        ],
      }),
    );
    expect(matrix).toEqual({
      miles: [
        [0, 1],
        [2, 0],
      ],
      minutes: [
        [0, 1],
        [2, 0],
      ],
    });
    delete process.env.ORS_API_URL;
  });
});
