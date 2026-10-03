import { describe, expect, it } from "vitest";
import { crewTooSmall } from "../checks/crew-too-small";
import { noUnloadMethod } from "../checks/no-unload-method";
import { tailLiftWeight } from "../checks/tail-lift-weight";
import { uprightHandball } from "../checks/upright-handball";
import { uprightTailLift } from "../checks/upright-tail-lift";
import { context, order, site, stop, vehicle } from "./fixtures";

const doors = (quantity = 3, weight = 140) =>
  order({
    order_ref: "SO-DOORS",
    lines: [{ unit_type_id: "dp", quantity, weight_per_unit_kg: weight, description: "" }],
  });

const luton = vehicle({
  id: "luton",
  name: "Luton 1",
  vehicle_type: "luton",
  unload_methods: ["tail_lift"],
  tail_lift_max_kg: 500,
  gross_weight_kg: 3500,
});
const curtain = vehicle({
  id: "curtain",
  name: "Curtainsider 1",
  vehicle_type: "curtainsider",
  unload_methods: ["side"],
  tail_lift_max_kg: null,
});

function at(siteOver: Parameters<typeof site>[0], lines = [doors()], v = luton) {
  return context({
    load: { vehicle: v, crew_size: 1 },
    stops: [stop({ site: site(siteOver), orders: lines })],
    vehicles: [curtain],
  });
}

describe("UPRIGHT_TAIL_LIFT", () => {
  it("blocks upright units on a tail-lift-only vehicle where the site has no forklift or handballing", () => {
    const [w] = uprightTailLift(at({ site_equipment: [], name: "Plot 14" }));
    expect(w).toMatchObject({
      code: "UPRIGHT_TAIL_LIFT",
      severity: "blocking",
      entity: { type: "stop" },
    });
    expect(w.detail).toContain("SO-DOORS: 3 × Door pack must travel upright");
    expect(w.detail).toContain("Plot 14 has no forklift");
    expect(w.fixes).toEqual([
      { id: "switch-vehicle", label: "Switch to Curtainsider 1", params: { vehicleId: "curtain" } },
    ]);
  });

  it("passes when the site has a forklift or Moffett, or the vehicle has side access", () => {
    expect(uprightTailLift(at({ site_equipment: ["forklift"] }))).toEqual([]);
    expect(uprightTailLift(at({ site_equipment: ["moffett"] }))).toEqual([]);
    expect(uprightTailLift(at({ site_equipment: [] }, [doors()], curtain))).toEqual([]);
  });

  it("hands over to UPRIGHT_HANDBALL when handballing is allowed, and ignores units that can lie flat", () => {
    expect(uprightTailLift(at({ site_equipment: [], handball_allowed: true }))).toEqual([]);
    expect(uprightTailLift(at({ site_equipment: [] }, [order()]))).toEqual([]);
  });
});

describe("UPRIGHT_HANDBALL", () => {
  it("tells the planner how many people are needed and offers to set the crew", () => {
    const [w] = uprightHandball(
      at({ site_equipment: [], handball_allowed: true, handball_people: 3, name: "Workshop" }),
    );
    expect(w).toMatchObject({ severity: "check", title: "Handball at Workshop: 3 people needed" });
    expect(w.fixes).toEqual([{ id: "set-crew", label: "Set crew to 3", params: { crew: 3 } }]);
  });

  it("defaults to two people and offers no crew fix when the crew is big enough", () => {
    const ctx = at({ site_equipment: [], handball_allowed: true });
    ctx.load.crew_size = 2;
    const [w] = uprightHandball(ctx);
    expect(w.title).toContain("2 people");
    expect(w.fixes).toEqual([]);
  });

  it("passes when a forklift is on site or nothing must stay upright", () => {
    expect(uprightHandball(at({ site_equipment: ["forklift"], handball_allowed: true }))).toEqual(
      [],
    );
    expect(uprightHandball(at({ site_equipment: [], handball_allowed: true }, [order()]))).toEqual(
      [],
    );
  });
});

describe("TAIL_LIFT_WEIGHT", () => {
  const heavy = order({
    order_ref: "SO-HEAVY",
    lines: [{ unit_type_id: "eur", quantity: 1, weight_per_unit_kg: 700, description: "" }],
  });

  it("blocks a unit heavier than the tail lift when the site can't unload it another way", () => {
    const [w] = tailLiftWeight(at({ site_equipment: [] }, [heavy]));
    expect(w).toMatchObject({ severity: "blocking", title: "Too heavy for the tail lift" });
    expect(w.detail).toContain("SO-HEAVY: Euro pallet at 700 kg each");
    expect(w.detail).toContain("takes 500 kg");
  });

  it("passes when a forklift can take it or it's within the limit", () => {
    expect(tailLiftWeight(at({ site_equipment: ["forklift"] }, [heavy]))).toEqual([]);
    expect(tailLiftWeight(at({ site_equipment: [] }, [order()]))).toEqual([]);
  });

  it("uses 750 kg when the tail lift limit isn't recorded, and ignores vehicles with no tail lift", () => {
    const v = vehicle({ unload_methods: ["tail_lift"], tail_lift_max_kg: null });
    expect(tailLiftWeight(at({ site_equipment: [] }, [heavy], v))).toEqual([]);
    expect(tailLiftWeight(at({ site_equipment: [] }, [heavy], curtain))).toEqual([]);
  });
});

describe("NO_UNLOAD_METHOD", () => {
  it("blocks when nothing on the vehicle matches the site", () => {
    // A side-access vehicle at a site with no forklift and no handballing.
    const [w] = noUnloadMethod(
      at({ site_equipment: [], name: "Farm" }, [order({ order_ref: "SO-P" })], curtain),
    );
    expect(w).toMatchObject({ severity: "blocking", title: "No way to unload at Farm" });
    expect(w.detail).toContain("SO-P: Euro pallet");
  });

  it("respects crane-only units", () => {
    const craneUnits = {
      ...context().unitTypes,
      eur: { ...context().unitTypes.eur, min_unload_method: "crane" as const },
    };
    const ctx = at({ site_equipment: ["forklift"] }, [order()], curtain);
    ctx.unitTypes = craneUnits;
    expect(noUnloadMethod(ctx)).toHaveLength(1);
    ctx.load.vehicle = vehicle({ unload_methods: ["crane"], crane_max_kg: 2000 });
    ctx.stops[0].site.crane_drop_allowed = true;
    expect(noUnloadMethod(ctx)).toEqual([]);
  });

  it("doesn't repeat what UPRIGHT_TAIL_LIFT and TAIL_LIFT_WEIGHT already say", () => {
    expect(noUnloadMethod(at({ site_equipment: [] }))).toEqual([]);
    const heavy = order({
      lines: [{ unit_type_id: "eur", quantity: 1, weight_per_unit_kg: 900, description: "" }],
    });
    expect(noUnloadMethod(at({ site_equipment: [] }, [heavy]))).toEqual([]);
  });
});

describe("CREW_TOO_SMALL", () => {
  it("asks for two when units need two people", () => {
    const ctx = at({ site_equipment: ["forklift"] });
    const [w] = crewTooSmall(ctx);
    expect(w).toMatchObject({ severity: "check", title: "Crew of 2 needed" });
    expect(w.detail).toBe("Door pack needs two people to handle, but the crew is 1.");
    expect(w.fixes[0]).toEqual({ id: "set-crew", label: "Set crew to 2", params: { crew: 2 } });
  });

  it("counts the people a handballing site needs when that's the only way off", () => {
    const boxes = order({
      lines: [{ unit_type_id: "eur", quantity: 10, weight_per_unit_kg: 20, description: "" }],
    });
    const ctx = at(
      { site_equipment: [], handball_allowed: true, handball_people: 3 },
      [boxes],
      curtain,
    );
    expect(crewTooSmall(ctx)[0].title).toBe("Crew of 3 needed");
  });

  it("passes when the crew is big enough or a forklift does the work", () => {
    const ctx = at({ site_equipment: ["forklift"] });
    ctx.load.crew_size = 2;
    expect(crewTooSmall(ctx)).toEqual([]);
    expect(
      crewTooSmall(at({ site_equipment: ["forklift"], handball_allowed: true }, [order()])),
    ).toEqual([]);
  });
});
