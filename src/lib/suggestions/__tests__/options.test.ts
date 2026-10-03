import { describe, expect, it } from "vitest";
import { buildContext } from "@/lib/planning/build";
import { DOOR_PACK, EURO } from "@/lib/rules/__tests__/fixtures";
import { deliveryOptions, palletSize } from "../options";
import {
  CLOCK,
  card,
  emptyLoad,
  haulier,
  planData,
  planOrder,
  planVehicle,
  stopFor,
} from "./fixtures";

function setup(orders: ReturnType<typeof planOrder>[], over: Parameters<typeof planData>[0] = {}) {
  const data = planData({ orders: Object.fromEntries(orders.map((o) => [o.id, o])), ...over });
  const bySite = [...new Set(orders.map((o) => o.site_id))];
  const load = emptyLoad({
    stops: bySite.map((s, i) => ({
      ...stopFor(
        `s${i}`,
        s,
        orders.filter((o) => o.site_id === s).map((o) => o.id),
      ),
      sequence: i + 1,
    })),
  });
  return {
    data,
    ctx: buildContext({ ...load }, { ...data, loads: [load, ...(over.loads ?? [])] }, CLOCK),
  };
}

describe("palletSize", () => {
  it("bands by height and weight, and refuses units bigger than a pallet", () => {
    expect(palletSize({ ...EURO, height_mm: 600 }, 200)).toBe("quarter");
    expect(palletSize({ ...EURO, height_mm: 1000 }, 450)).toBe("half");
    expect(palletSize(EURO, 300)).toBe("full");
    expect(palletSize(EURO, 1200)).toBeNull();
    expect(palletSize(DOOR_PACK, 140)).toBeNull();
  });
});

describe("deliveryOptions", () => {
  it("prices own vehicles from miles and hours, cheapest first, labelled estimates", () => {
    const { data, ctx } = setup([planOrder("glos")], {
      vehicles: [
        planVehicle({ id: "big", name: "18t", cost_per_mile: 1.5 }),
        planVehicle({ id: "v1", name: "7.5t", cost_per_mile: 1 }),
      ],
    });
    const options = deliveryOptions(ctx, data);
    expect(options.map((o) => o.name)).toEqual(["7.5t", "18t"]);
    expect(options[0]).toMatchObject({
      valid: true,
      estimate: true,
      current: true,
      detail: "Own vehicle · estimated distance",
    });
    expect(options[0].breakdown[0].label).toMatch(/^\d+ miles × £1\.00$/);
    expect(options[0].cost).toBeCloseTo(options[0].breakdown.reduce((s, l) => s + l.amount, 0));
  });

  it("greys out vehicles that would block, are busy or off road, with the reason, at the bottom", () => {
    const heavy = planOrder("glos", {
      lines: [{ unit_type_id: "eur", quantity: 4, weight_per_unit_kg: 3000, description: "" }],
    });
    const { data, ctx } = setup([heavy], {
      vehicles: [
        planVehicle({ id: "v1", name: "Small", payload_kg: 2000 }),
        planVehicle({ id: "big", name: "Big", payload_kg: 20000 }),
        planVehicle({
          id: "off",
          name: "Serviced",
          payload_kg: 20000,
          off_road_from: "2026-10-01",
          off_road_until: "2026-10-09",
        }),
        planVehicle({ id: "busy", name: "Busy", payload_kg: 20000 }),
      ],
      loads: [emptyLoad({ id: "other", vehicle_id: "busy" })],
    });
    const options = deliveryOptions(ctx, data);
    expect(options[0].name).toBe("Big");
    const byName = Object.fromEntries(options.map((o) => [o.name, o]));
    expect(byName.Small).toMatchObject({ valid: false });
    expect(byName.Small.reasons[0]).toContain("too heavy");
    expect(byName.Serviced.reasons).toContain("Off road on 06/10/2026");
    expect(byName.Busy.reasons).toContain("Already on another load that day");
    expect(options.slice(1).every((o) => !o.valid)).toBe(true);
  });

  it("prices a pallet network per pallet with drops and surcharges, and notes waiting time", () => {
    const [a, b] = [planOrder("glos"), planOrder("chelt", { urgency: "timed" })];
    const { data, ctx } = setup([a, b], { vehicles: [], hauliers: [haulier()] });
    data.sites.glos.site_equipment = [];
    const [option] = deliveryOptions(
      buildContext(
        {
          ...ctx.load,
          ...emptyLoad({
            stops: ctx.stops.map((s, i) =>
              stopFor(
                s.id,
                s.site.id,
                s.orders.map((o) => o.id),
                { sequence: i + 1 },
              ),
            ),
          }),
        },
        data,
        CLOCK,
      ),
      data,
    );
    expect(option).toMatchObject({ kind: "haulier", valid: true, estimate: false });
    expect(option.breakdown.map((l) => [l.label, l.amount])).toEqual([
      [`${a.order_ref}: 4 × full pallet (Gloucestershire)`, 160],
      [`${b.order_ref}: 4 × full pallet (Gloucestershire)`, 160],
      ["1 extra drop", 10],
      ["Tail lift, 4 × £5.00", 20],
      ["Timed delivery × 1", 15],
    ]);
    expect(option.cost).toBe(365);
    expect(option.notes[0]).toContain("Waiting over 30 minutes is £30.00 an hour");
    data.sites.glos.site_equipment = ["forklift"];
  });

  it("explains why a haulier can't do it", () => {
    const doors = planOrder("newport", {
      lines: [{ unit_type_id: "dp", quantity: 2, weight_per_unit_kg: 140, description: "" }],
    });
    const { data, ctx } = setup([doors], {
      vehicles: [],
      hauliers: [
        haulier({ id: "nocard", name: "No card", rateCards: [card({ valid_from: "2027-01-01" })] }),
        haulier({ id: "pallets", name: "Pallets" }),
        haulier({ id: "local", name: "Local", coverage_areas: ["GL"] }),
      ],
    });
    const byName = Object.fromEntries(deliveryOptions(ctx, data).map((o) => [o.name, o]));
    expect(byName["No card"].reasons).toEqual(["No rate card for 06/10/2026"]);
    expect(byName.Pallets.reasons[0]).toMatch(
      /^Door pack \(2,200 mm × 1,000 mm × 1,200 mm, 140 kg\) won't go as a pallet/,
    );
    expect(byName.Local.reasons).toContain("Doesn't cover NP");
    expect(Object.values(byName).every((o) => !o.valid && o.cost === null)).toBe(true);
  });

  it("uses part or full load prices, and needs the right services", () => {
    const loadCard = card({ pallet: {}, load: { wales: { part: 180, full: 320 } }, per_drop: 25 });
    const { data, ctx } = setup([planOrder("newport")], {
      vehicles: [],
      hauliers: [
        haulier({ id: "h", name: "Haulage", haulier_type: "haulier", rateCards: [loadCard] }),
      ],
    });
    const [option] = deliveryOptions(ctx, data);
    expect(option.breakdown).toEqual([
      { label: "Part load (South Wales)", amount: 180 },
      { label: "Drop charge", amount: 25 },
    ]);
    const twoPerson = planOrder("newport", {
      lines: [{ unit_type_id: "dp", quantity: 1, weight_per_unit_kg: 140, description: "" }],
    });
    const second = setup([twoPerson], { vehicles: [], hauliers: data.hauliers });
    expect(deliveryOptions(second.ctx, second.data)[0].reasons).toContain(
      "No two-person delivery service",
    );
  });
});
