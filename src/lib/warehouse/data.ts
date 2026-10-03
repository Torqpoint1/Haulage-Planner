import "server-only";
import { logoUrl } from "@/lib/branding";
import { buildContext } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import { driverNames, loadTitle } from "@/lib/planning/labels";
import type { LoadStatus } from "@/lib/planning/types";
import { estimateRun } from "@/lib/rules/estimate";
import { fromMinutes } from "@/lib/rules/time";
import { londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  pickSheet,
  type PickSection,
  type PickState,
  type PickTotals,
  type SheetStop,
  type SheetUnit,
} from "./pick-sheet";

/** One load, ready for the warehouse screen and the print layouts (spec 9.5, 10.8). */
export type SheetLoad = {
  id: string;
  date: string;
  status: LoadStatus;
  title: string;
  subtitle: string;
  drivers: string;
  crew: number;
  depot: { name: string; address: string; postcode: string } | null;
  startTime: string;
  notes: string;
  /** Drop order, with what the driver needs at each stop. */
  stops: (SheetStop & {
    eta: string | null;
    etaPlanned: boolean;
    bookingRef: string;
    bookingSlot: string | null;
    contacts: { name: string; phone: string }[];
    instructions: string[];
  })[];
  /** Load order: last drop first. */
  sections: PickSection[];
  totals: PickTotals;
  roadDistances: boolean;
  miles: number | null;
};

export type SheetData = {
  date: string;
  loads: SheetLoad[];
  organisation: { name: string; logo: string | null };
};

/** Every load on a date (or just one), with its pick sheet and run sheet details. */
export async function loadSheets(date: string, onlyLoadId?: string): Promise<SheetData> {
  const supabase = await createClient();
  const [data, { data: org }] = await Promise.all([
    loadPlanData(date, date),
    supabase.from("organisations").select("name, logo_path").single(),
  ]);
  const loads = data.loads
    .filter((l) => l.load_date === date && (!onlyLoadId || l.id === onlyLoadId))
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id));
  const orderIds = loads.flatMap((l) => l.stops.flatMap((s) => s.order_ids));
  const siteIds = [...new Set(loads.flatMap((l) => l.stops.map((s) => s.site_id)))];

  const [ordersRes, linesRes, unitsRes, contactsRes, depotsRes] = await Promise.all([
    orderIds.length
      ? supabase
          .from("orders")
          .select("id, customer_po, delivery_note_number, delivery_instructions")
          .in("id", orderIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            customer_po: string;
            delivery_note_number: string;
            delivery_instructions: string;
          }[],
        }),
    orderIds.length
      ? supabase
          .from("order_lines")
          .select("id, order_id, unit_type_id, quantity, description, position")
          .in("order_id", orderIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            order_id: string;
            unit_type_id: string;
            quantity: number;
            description: string;
            position: number;
          }[],
        }),
    supabase
      .from("unit_types")
      .select(
        "id, name, short_code, stackable, max_stack_height, must_stay_upright, fragile, requires_two_people, min_unload_method, securing_notes",
      ),
    siteIds.length
      ? supabase.from("contacts").select("name, phone, site_id, customer_id").in("site_id", siteIds)
      : Promise.resolve({
          data: [] as {
            name: string;
            phone: string;
            site_id: string | null;
            customer_id: string;
          }[],
        }),
    supabase.from("depots").select("id, name, address, postcode"),
  ]);
  const lineIds = (linesRes.data ?? []).map((l) => l.id);
  const { data: pickRows } = lineIds.length
    ? await supabase
        .from("pick_lines")
        .select("order_line_id, picked, loaded, shortage, shortage_note")
        .in("order_line_id", lineIds)
    : { data: [] };

  const extra = new Map((ordersRes.data ?? []).map((o) => [o.id, o]));
  const units: Record<string, SheetUnit> = Object.fromEntries(
    ((unitsRes.data ?? []) as SheetUnit[]).map((u) => [u.id, u]),
  );
  const picks: Record<string, PickState> = Object.fromEntries(
    (pickRows ?? []).map((p) => [
      p.order_line_id,
      { picked: p.picked, loaded: p.loaded, shortage: p.shortage, shortage_note: p.shortage_note },
    ]),
  );
  const linesByOrder = new Map<string, NonNullable<typeof linesRes.data>>();
  for (const l of linesRes.data ?? [])
    linesByOrder.set(l.order_id, [...(linesByOrder.get(l.order_id) ?? []), l]);
  const clock = { now: new Date(), today: londonToday() };

  return {
    date,
    organisation: { name: org?.name ?? "", logo: await logoUrl(org?.logo_path ?? null) },
    loads: loads.map((load) => {
      const ctx = buildContext(load, data, clock);
      const run = estimateRun(ctx);
      const stops = load.stops.map((s) => {
        const site = data.sites[s.site_id];
        const orders = s.order_ids.map((id) => {
          const o = data.orders[id];
          const e = extra.get(id);
          return {
            id,
            order_ref: o?.order_ref ?? "",
            customer_name: o?.customer_name ?? "",
            customer_po: e?.customer_po ?? "",
            delivery_note_number: e?.delivery_note_number ?? "",
            delivery_instructions: e?.delivery_instructions ?? "",
            lines: [...(linesByOrder.get(id) ?? [])]
              .sort((a, b) => a.position - b.position)
              .map((l) => ({
                id: l.id,
                unit_type_id: l.unit_type_id,
                quantity: l.quantity,
                description: l.description,
              })),
          };
        });
        const est = run.stops.find((x) => x.stopId === s.id);
        return {
          id: s.id,
          sequence: s.sequence,
          site: {
            id: s.site_id,
            name: site?.name ?? "Site",
            address: site?.address ?? "",
            postcode: site?.postcode ?? "",
          },
          orders,
          eta: est?.expected != null ? fromMinutes(est.expected) : null,
          etaPlanned: Boolean(s.booking_slot || s.eta_from),
          bookingRef: s.booking_ref,
          bookingSlot: s.booking_slot,
          contacts: (contactsRes.data ?? [])
            .filter((c) => c.site_id === s.site_id)
            .map((c) => ({ name: c.name, phone: c.phone })),
          instructions: [
            ...new Set(orders.map((o) => o.delivery_instructions.trim()).filter(Boolean)),
          ],
        };
      });
      const { sections, totals } = pickSheet(stops, units, picks);
      const { title, subtitle } = loadTitle(load, data);
      const depot = (depotsRes.data ?? []).find((d) => d.id === load.depot_id);
      return {
        id: load.id,
        date,
        status: load.status,
        title,
        subtitle,
        drivers: driverNames(load, data),
        crew: load.crew_size,
        depot: depot
          ? { name: depot.name, address: depot.address, postcode: depot.postcode }
          : null,
        startTime: load.start_time,
        notes: load.notes,
        stops,
        sections,
        totals,
        roadDistances: run.roadDistances,
        miles: run.miles,
      };
    }),
  };
}
