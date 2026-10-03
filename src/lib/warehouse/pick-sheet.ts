/**
 * Pick sheets (spec 9.5): what to pick for a load, in load order. The last
 * drop goes on first, so the stops are listed in reverse drop order.
 * Handling notes and load securing notes come from each unit type's settings.
 */

export type SheetUnit = {
  id: string;
  name: string;
  short_code: string;
  stackable: boolean;
  max_stack_height: number | null;
  must_stay_upright: boolean;
  fragile: boolean;
  requires_two_people: boolean;
  min_unload_method: "any" | "forklift" | "crane";
  securing_notes: string;
};

export type PickState = {
  picked: boolean;
  loaded: boolean;
  shortage: boolean;
  shortage_note: string;
};

export type SheetLine = { id: string; unit_type_id: string; quantity: number; description: string };

export type SheetOrder = {
  id: string;
  order_ref: string;
  customer_name: string;
  customer_po: string;
  delivery_note_number: string;
  delivery_instructions: string;
  lines: SheetLine[];
};

export type SheetStop = {
  id: string;
  sequence: number;
  site: { id: string; name: string; address: string; postcode: string };
  orders: SheetOrder[];
};

export type PickLine = SheetLine & {
  unitName: string;
  unitCode: string;
  handling: string[];
  securing: string;
  pick: PickState;
};

export type PickSection = {
  /** 1 = goes on the vehicle first. */
  loadPosition: number;
  /** Drop number on the run. */
  dropNumber: number;
  isLastDrop: boolean;
  stop: SheetStop;
  orders: (Omit<SheetOrder, "lines"> & { lines: PickLine[] })[];
};

export type PickTotals = {
  lines: number;
  units: number;
  picked: number;
  loaded: number;
  shortages: number;
};

export const NOT_TICKED: PickState = {
  picked: false,
  loaded: false,
  shortage: false,
  shortage_note: "",
};

/** Plain-English handling notes for a unit type. Nothing industry-specific: it's all from settings. */
export function handlingNotes(u: SheetUnit | undefined): string[] {
  if (!u) return [];
  const out: string[] = [];
  if (u.must_stay_upright) out.push("Keep upright");
  if (u.fragile) out.push("Fragile");
  if (u.requires_two_people) out.push("Two people to handle");
  if (u.stackable)
    out.push(u.max_stack_height ? `Stack up to ${u.max_stack_height} high` : "Can be stacked");
  else out.push("Don't stack");
  if (u.min_unload_method === "forklift") out.push("Forklift only");
  if (u.min_unload_method === "crane") out.push("Crane only");
  return out;
}

export function pickSheet(
  stops: SheetStop[],
  units: Record<string, SheetUnit>,
  picks: Record<string, PickState>,
): { sections: PickSection[]; totals: PickTotals } {
  const ordered = [...stops].sort((a, b) => b.sequence - a.sequence);
  const totals: PickTotals = { lines: 0, units: 0, picked: 0, loaded: 0, shortages: 0 };
  const sections = ordered.map((stop, i) => ({
    loadPosition: i + 1,
    dropNumber: stop.sequence,
    isLastDrop: i === 0,
    stop,
    orders: stop.orders.map((o) => ({
      ...o,
      lines: o.lines.map((l) => {
        const u = units[l.unit_type_id];
        const pick = picks[l.id] ?? NOT_TICKED;
        totals.lines += 1;
        totals.units += l.quantity;
        if (pick.picked) totals.picked += 1;
        if (pick.loaded) totals.loaded += 1;
        if (pick.shortage) totals.shortages += 1;
        return {
          ...l,
          unitName: u?.name ?? "Unknown unit",
          unitCode: u?.short_code ?? "?",
          handling: handlingNotes(u),
          securing: u?.securing_notes ?? "",
          pick,
        };
      }),
    })),
  }));
  return { sections, totals };
}
