import { describe, expect, it } from "vitest";
import { spaceUse } from "../capacity";
import { capacitySpace } from "../checks/capacity-space";
import { capacityWeight } from "../checks/capacity-weight";
import { DOOR_PACK, EURO, LONG, context, order, stop, vehicle } from "./fixtures";

const withLines = (
  lines: { unit_type_id: string; quantity: number; weight_per_unit_kg: number }[],
) =>
  context({
    stops: [stop({ orders: [order({ lines: lines.map((l) => ({ ...l, description: "" })) })] })],
  });

describe("spaceUse", () => {
  it("uses the capacity matrix where there is one", () => {
    const use = spaceUse(
      [{ unit_type_id: "eur", quantity: 9, weight_per_unit_kg: 1, description: "", unit: EURO }],
      vehicle(),
    );
    expect(use.share).toBeCloseTo(0.5);
    expect(use.units).toEqual({ used: 9, max: 18, code: "EUR" });
  });

  it("falls back to floor space and stacks stackable units", () => {
    // 8 long lengths stack 4 high: 2 stacks of 4.8 m × 0.3 m on a 7.3 m × 2.48 m deck.
    const use = spaceUse(
      [{ unit_type_id: "ll", quantity: 8, weight_per_unit_kg: 1, description: "", unit: LONG }],
      vehicle(),
    );
    expect(use.share).toBeCloseTo((2 * 4800 * 300) / (7300 * 2480));
    expect(use.units).toBeNull();
  });

  it("adds mixed unit types as shares and flags units too big for the deck", () => {
    const small = vehicle({
      deck_length_mm: 3000,
      deck_width_mm: 2000,
      deck_height_mm: 1000,
      capacities: {},
    });
    const use = spaceUse(
      [
        {
          unit_type_id: "eur",
          quantity: 2,
          weight_per_unit_kg: 1,
          description: "",
          unit: { ...EURO, height_mm: 900 },
        },
        { unit_type_id: "ll", quantity: 1, weight_per_unit_kg: 1, description: "", unit: LONG },
      ],
      small,
    );
    expect(use.tooBig.map((u) => u.id)).toEqual(["ll"]);
    expect(use.share).toBeCloseTo((2 * 1200 * 800) / (3000 * 2000));
  });
});

describe("CAPACITY_SPACE", () => {
  it("passes when the units fit", () => {
    expect(
      capacitySpace(withLines([{ unit_type_id: "eur", quantity: 18, weight_per_unit_kg: 100 }])),
    ).toEqual([]);
  });

  it("blocks when the matrix is exceeded, naming the numbers and offering fixes", () => {
    const ctx = withLines([{ unit_type_id: "eur", quantity: 20, weight_per_unit_kg: 100 }]);
    ctx.vehicles = [
      vehicle({ id: "big", name: "Artic 1", gross_weight_kg: 44000, capacities: { eur: 26 } }),
    ];
    const [w] = capacitySpace(ctx);
    expect(w).toMatchObject({
      code: "CAPACITY_SPACE",
      severity: "blocking",
      entity: { type: "load", id: "load1" },
    });
    expect(w.detail).toContain("20 EUR on a vehicle that takes 18");
    expect(w.fixes.map((f) => f.label)).toEqual([
      "Switch to Artic 1",
      expect.stringMatching(/^Take SO-\d+ off this load$/),
    ]);
  });

  it("blocks mixed loads by floor space, and units that can't fit the deck at all", () => {
    const over = withLines([
      { unit_type_id: "eur", quantity: 12, weight_per_unit_kg: 1 },
      { unit_type_id: "dp", quantity: 6, weight_per_unit_kg: 1 },
    ]);
    expect(capacitySpace(over)[0].detail).toMatch(/floor space/);
    const tiny = withLines([{ unit_type_id: "ll", quantity: 1, weight_per_unit_kg: 1 }]);
    tiny.load.vehicle = vehicle({ deck_length_mm: 3000, capacities: {} });
    expect(capacitySpace(tiny)[0].title).toBe("Units don't fit the vehicle");
  });

  it("doesn't apply to haulier loads or loads with no vehicle yet", () => {
    const ctx = withLines([{ unit_type_id: "eur", quantity: 99, weight_per_unit_kg: 1 }]);
    ctx.load.vehicle = null;
    expect(capacitySpace(ctx)).toEqual([]);
  });

  it("doesn't offer vehicles that are off road, busy or too small", () => {
    const ctx = withLines([{ unit_type_id: "eur", quantity: 20, weight_per_unit_kg: 100 }]);
    ctx.vehicles = [
      vehicle({
        id: "off",
        name: "Off road",
        capacities: { eur: 26 },
        off_road_from: "2026-10-01",
        off_road_until: "2026-10-10",
      }),
      vehicle({ id: "busy", name: "Busy", capacities: { eur: 26 } }),
      vehicle({ id: "small", name: "Small", capacities: { eur: 10 } }),
    ];
    ctx.busyVehicleIds = ["busy"];
    expect(capacitySpace(ctx)[0].fixes.filter((f) => f.id === "switch-vehicle")).toEqual([]);
  });
});

describe("CAPACITY_WEIGHT", () => {
  it("passes under the near-limit share", () => {
    expect(
      capacityWeight(withLines([{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 800 }])),
    ).toEqual([]);
  });

  it("is a check from 90% of payload", () => {
    const [w] = capacityWeight(
      withLines([{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 810 }]),
    );
    expect(w).toMatchObject({ severity: "check", title: "Close to the vehicle's payload" });
    expect(w.detail).toContain("8,100 kg is 90%");
  });

  it("blocks over payload, saying by how much", () => {
    const [w] = capacityWeight(
      withLines([{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 950 }]),
    );
    expect(w.severity).toBe("blocking");
    expect(w.detail).toContain("500 kg too heavy");
  });

  it("follows the organisation's threshold, and exactly at payload is not over", () => {
    const ctx = withLines([{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 900 }]);
    expect(capacityWeight(ctx)[0].severity).toBe("check");
    ctx.thresholds.capacity_near_limit_pct = 100;
    expect(capacityWeight(ctx)[0].severity).toBe("check");
    ctx.thresholds.capacity_near_limit_pct = 100;
    ctx.stops[0].orders[0].lines[0].weight_per_unit_kg = 899;
    expect(capacityWeight(ctx)).toEqual([]);
  });

  it("ignores loads with no vehicle", () => {
    const ctx = withLines([{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 5000 }]);
    ctx.load.vehicle = null;
    expect(capacityWeight(ctx)).toEqual([]);
  });
});

void DOOR_PACK;
