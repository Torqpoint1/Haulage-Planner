import { describe, expect, it } from "vitest";
import { handlingNotes, pickSheet, type SheetStop, type SheetUnit } from "../pick-sheet";

const unit = (over: Partial<SheetUnit> = {}): SheetUnit => ({
  id: "eur",
  name: "Euro pallet",
  short_code: "EUR",
  stackable: false,
  max_stack_height: null,
  must_stay_upright: false,
  fragile: false,
  requires_two_people: false,
  min_unload_method: "any",
  securing_notes: "",
  ...over,
});
const units = {
  eur: unit(),
  dp: unit({
    id: "dp",
    name: "Door pack",
    short_code: "DP",
    must_stay_upright: true,
    requires_two_people: true,
    securing_notes: "Strap to the headboard",
  }),
};
const stop = (
  id: string,
  sequence: number,
  site: string,
  lines: { id: string; unit_type_id: string; quantity: number }[],
): SheetStop => ({
  id,
  sequence,
  site: { id: site, name: site, address: "", postcode: "GL1 2BB" },
  orders: [
    {
      id: `o-${id}`,
      order_ref: `SO-${id}`,
      customer_name: "Hillside",
      customer_po: "",
      delivery_note_number: "",
      delivery_instructions: "",
      lines: lines.map((l) => ({ ...l, description: "" })),
    },
  ],
});

describe("pickSheet", () => {
  const stops = [
    stop("a", 1, "First drop", [{ id: "l1", unit_type_id: "eur", quantity: 4 }]),
    stop("b", 2, "Second drop", [{ id: "l2", unit_type_id: "dp", quantity: 2 }]),
    stop("c", 3, "Last drop", [
      { id: "l3", unit_type_id: "eur", quantity: 1 },
      { id: "l4", unit_type_id: "dp", quantity: 3 },
    ]),
  ];

  it("lists stops in reverse drop order: the last drop goes on first", () => {
    const { sections } = pickSheet(stops, units, {});
    expect(sections.map((s) => [s.loadPosition, s.dropNumber, s.stop.site.name])).toEqual([
      [1, 3, "Last drop"],
      [2, 2, "Second drop"],
      [3, 1, "First drop"],
    ]);
    expect(sections[0].isLastDrop).toBe(true);
    expect(sections.slice(1).every((s) => !s.isLastDrop)).toBe(true);
  });

  it("carries handling and securing notes from the unit settings", () => {
    const { sections } = pickSheet(stops, units, {});
    const doors = sections[1].orders[0].lines[0];
    expect(doors).toMatchObject({
      unitName: "Door pack",
      unitCode: "DP",
      securing: "Strap to the headboard",
    });
    expect(doors.handling).toEqual(["Keep upright", "Two people to handle", "Don't stack"]);
  });

  it("totals progress across the load", () => {
    const { totals } = pickSheet(stops, units, {
      l1: { picked: true, loaded: true, shortage: false, shortage_note: "" },
      l2: { picked: true, loaded: false, shortage: false, shortage_note: "" },
      l4: { picked: false, loaded: false, shortage: true, shortage_note: "1 short" },
    });
    expect(totals).toEqual({ lines: 4, units: 10, picked: 2, loaded: 1, shortages: 1 });
  });

  it("copes with no stops and unknown units", () => {
    expect(pickSheet([], units, {}).sections).toEqual([]);
    const odd = pickSheet(
      [stop("x", 1, "Site", [{ id: "l9", unit_type_id: "gone", quantity: 1 }])],
      units,
      {},
    );
    expect(odd.sections[0].orders[0].lines[0]).toMatchObject({
      unitName: "Unknown unit",
      handling: [],
    });
  });
});

describe("handlingNotes", () => {
  it("describes stacking and unloading limits", () => {
    expect(
      handlingNotes(
        unit({ stackable: true, max_stack_height: 4, fragile: true, min_unload_method: "crane" }),
      ),
    ).toEqual(["Fragile", "Stack up to 4 high", "Crane only"]);
    expect(handlingNotes(unit({ stackable: true }))).toEqual(["Can be stacked"]);
  });
});
