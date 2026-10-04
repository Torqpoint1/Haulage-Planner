import { describe, expect, it } from "vitest";
import { buildContext } from "@/lib/planning/build";
import type { PlanAsset } from "@/lib/planning/types";
import { runChecks } from "@/lib/rules";
import { assetCollections } from "../collections";
import { CLOCK, SITES, emptyLoad, planData, planOrder, stopFor } from "./fixtures";

const asset = (id: string, siteId: string, due: string | null, over: Partial<PlanAsset> = {}) =>
  ({
    id,
    asset_number: id.toUpperCase(),
    unit_type_id: "stillage",
    unit_type_name: "Stillage",
    status: "at_customer",
    depot_id: null,
    customer_id: "c",
    site_id: siteId,
    load_id: null,
    expected_return_date: due,
    ...over,
  }) as PlanAsset;

describe("assetCollections (spec 8.5)", () => {
  const onLoad = planOrder("glos");
  const ctxWith = (assets: PlanAsset[]) => {
    const data = planData({ orders: { [onLoad.id]: onLoad }, assets });
    return {
      ctx: buildContext(emptyLoad({ stops: [stopFor("s1", "glos", [onLoad.id])] }), data, CLOCK),
      data,
    };
  };
  const today = CLOCK.today;

  it("suggests collecting overdue assets from sites near the route, with the reasons", () => {
    const assets = [
      asset("st-1", "chelt", "2026-09-01"),
      asset("st-2", "chelt", "2026-09-20"),
      asset("st-3", "chelt", "2099-01-01"), // not due yet
      asset("st-4", "newport", "2026-09-01"), // too far
      asset("st-5", "chelt", null), // no return date
    ];
    const { ctx } = ctxWith(assets);
    const out = assetCollections(ctx, assets, SITES, 10, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ siteId: "chelt", onRoute: false, estimate: true });
    expect(out[0].assets.map((a) => a.label)).toEqual(["Stillage ST-1", "Stillage ST-2"]);
    expect(out[0].extraMiles).toBeGreaterThan(0);
    expect(out[0].reasons[0]).toMatch(/miles from the route|On the route/);
    expect(out[0].reasons[1]).toMatch(/^2 assets overdue; the oldest was due back 01\/09\/2026/);
    expect(today > "2026-09-20").toBe(true);
  });

  it("collecting at a stop already on the load costs no extra miles", () => {
    const assets = [asset("st-1", "glos", "2026-09-01")];
    const { ctx } = ctxWith(assets);
    const [s] = assetCollections(ctx, assets, SITES, 10, new Set());
    expect(s).toMatchObject({ onRoute: true, extraMiles: 0 });
    expect(s.reasons[0]).toBe("This load already stops at Gloucester.");
  });

  it("skips assets already planned for collection, and ones not at a customer", () => {
    const assets = [
      asset("st-1", "chelt", "2026-09-01"),
      asset("st-2", "chelt", "2026-09-01", { status: "at_depot", site_id: null }),
    ];
    const { ctx } = ctxWith(assets);
    expect(assetCollections(ctx, assets, SITES, 10, new Set(["st-1"]))).toEqual([]);
  });

  it("feeds ASSET_OVERDUE on a stop where assets are overdue", () => {
    const { ctx } = ctxWith([asset("st-1", "glos", "2026-09-01")]);
    const w = runChecks(ctx).find((x) => x.code === "ASSET_OVERDUE");
    expect(w?.title).toBe("1 asset to collect at Gloucester");
  });
});
