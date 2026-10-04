import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dateRange, hasFilters, unitTotals, type HistoryFilters } from "./filters";

/** One delivery found by a history search, with everything recorded about it (spec 9.6). */
export type HistoryOrder = {
  id: string;
  ref: string;
  customerPo: string;
  deliveryNote: string;
  invoice: string;
  status: string;
  lines: {
    id: string;
    unit: string;
    description: string;
    quantity: number;
    delivered: number | null;
  }[];
  documents: { name: string; url: string | null }[];
};

export type HistoryStop = {
  id: string;
  sequence: number;
  siteName: string;
  postcode: string;
  customerName: string;
  status: string;
  hasPod: boolean;
  bookingRef: string;
  bookingSlot: string | null;
  confirmation: {
    confirmed: boolean;
    by: string;
    method: string | null;
    at: string | null;
    note: string;
    attachmentUrl: string | null;
  };
  orders: HistoryOrder[];
};

export type HistoryLoad = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  drivers: string;
  status: string;
  stops: HistoryStop[];
};

export type HistoryResults = {
  loads: HistoryLoad[];
  orders: number;
  deliveries: number;
  units: { unit: string; quantity: number }[];
  /** More matched than we show; narrow the search. */
  truncated: boolean;
};

export type HistoryChoices = {
  customers: { id: string; name: string }[];
  sites: { id: string; name: string; customerId: string; postcode: string }[];
  vehicles: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
  hauliers: { id: string; name: string }[];
};

const LIMIT = 500;
const LINK_SECONDS = 15 * 60;

export async function loadHistoryChoices(): Promise<HistoryChoices> {
  const supabase = await createClient();
  const [c, s, v, d, h] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("sites").select("id, name, customer_id, postcode").order("name"),
    supabase.from("vehicles").select("id, name").order("name"),
    supabase.from("drivers").select("id, name").order("name"),
    supabase.from("hauliers").select("id, name").order("name"),
  ]);
  return {
    customers: c.data ?? [],
    sites: (s.data ?? []).map((x) => ({
      id: x.id,
      name: x.name,
      customerId: x.customer_id,
      postcode: x.postcode,
    })),
    vehicles: v.data ?? [],
    drivers: d.data ?? [],
    hauliers: h.data ?? [],
  };
}

export async function searchHistory(f: HistoryFilters): Promise<HistoryResults | null> {
  if (!hasFilters(f)) return null;
  const supabase = await createClient();
  const range = dateRange(f);
  const { data: hits, error } = await supabase.rpc("search_history", {
    q: f.q || null,
    target_customer: f.customer,
    target_site: f.site,
    date_from: range.from,
    date_to: range.to,
    target_vehicle: f.vehicle,
    target_driver: f.driver,
    target_haulier: f.haulier,
    max_rows: LIMIT + 1,
  });
  if (error) throw new Error(`History: ${error.message}`);
  const rows = (hits ?? []) as { order_id: string; stop_id: string; load_id: string }[];
  const truncated = rows.length > LIMIT;
  const found = rows.slice(0, LIMIT);
  if (!found.length) return { loads: [], orders: 0, deliveries: 0, units: [], truncated: false };

  const loadIds = [...new Set(found.map((r) => r.load_id))];
  const stopIds = [...new Set(found.map((r) => r.stop_id))];
  const orderIds = [...new Set(found.map((r) => r.order_id))];

  const [loadsRes, stopsRes, ordersRes, linesRes, docsRes, podsRes, podLinesRes] =
    await Promise.all([
      supabase
        .from("loads")
        .select(
          "id, load_date, status, vehicle:vehicles(name, registration), haulier:hauliers(name), drivers:load_drivers(driver:drivers(name))",
        )
        .in("id", loadIds),
      supabase
        .from("load_stops")
        .select(
          "id, load_id, sequence, status, booking_ref, booking_slot, confirmed, confirmed_by, confirmation_method, confirmed_at, confirmation_note, confirmation_attachment_path, site:sites(name, postcode, customer:customers(name))",
        )
        .in("id", stopIds),
      supabase
        .from("orders")
        .select("id, order_ref, customer_po, delivery_note_number, invoice_number, status")
        .in("id", orderIds),
      supabase
        .from("order_lines")
        .select("id, order_id, quantity, description, position, unit_type:unit_types(name)")
        .in("order_id", orderIds),
      supabase
        .from("order_attachments")
        .select("order_id, file_name, storage_path")
        .in("order_id", orderIds),
      supabase.from("pods").select("id, stop_id").in("stop_id", stopIds),
      supabase
        .from("pod_lines")
        .select("order_line_id, delivered_quantity, pod:pods!inner(stop_id)")
        .in("order_id", orderIds),
    ]);
  for (const r of [loadsRes, stopsRes, ordersRes, linesRes]) {
    if (r.error) throw new Error(`History: ${r.error.message}`);
  }

  type StopRow = {
    id: string;
    load_id: string;
    sequence: number;
    status: string;
    booking_ref: string;
    booking_slot: string | null;
    confirmed: boolean;
    confirmed_by: string;
    confirmation_method: string | null;
    confirmed_at: string | null;
    confirmation_note: string;
    confirmation_attachment_path: string | null;
    site: { name: string; postcode: string; customer: { name: string } | null } | null;
  };
  const stops = (stopsRes.data ?? []) as unknown as StopRow[];

  // Short-lived links for documents and confirmation screenshots.
  const paths = [
    ...(docsRes.data ?? []).map((d) => d.storage_path),
    ...stops.map((s) => s.confirmation_attachment_path).filter((p): p is string => Boolean(p)),
  ];
  const { data: signed } = paths.length
    ? await supabase.storage.from("organisation-files").createSignedUrls(paths, LINK_SECONDS)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const link = (path: string | null) =>
    path ? ((signed ?? []).find((x) => x.path === path)?.signedUrl ?? null) : null;

  const podStops = new Set((podsRes.data ?? []).map((p) => p.stop_id));
  // Delivered quantity per line, from the POD at the stop it was found on.
  const delivered = new Map<string, number>();
  for (const pl of (podLinesRes.data ?? []) as unknown as {
    order_line_id: string;
    delivered_quantity: number;
    pod: { stop_id: string } | null;
  }[]) {
    if (pl.pod && stopIds.includes(pl.pod.stop_id))
      delivered.set(`${pl.pod.stop_id}:${pl.order_line_id}`, pl.delivered_quantity);
  }

  type LineRow = {
    id: string;
    order_id: string;
    quantity: number;
    description: string;
    position: number;
    unit_type: { name: string } | null;
  };
  const lines = (linesRes.data ?? []) as unknown as LineRow[];
  const ordersById = new Map((ordersRes.data ?? []).map((o) => [o.id, o]));
  const unitLines: { unit: string; quantity: number }[] = [];

  const toOrder = (orderId: string, stopId: string): HistoryOrder | null => {
    const o = ordersById.get(orderId);
    if (!o) return null;
    const own = lines
      .filter((l) => l.order_id === orderId)
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const got = delivered.get(`${stopId}:${l.id}`);
        unitLines.push({ unit: l.unit_type?.name ?? "Item", quantity: got ?? l.quantity });
        return {
          id: l.id,
          unit: l.unit_type?.name ?? "Item",
          description: l.description,
          quantity: l.quantity,
          delivered: got ?? null,
        };
      });
    return {
      id: o.id,
      ref: o.order_ref,
      customerPo: o.customer_po,
      deliveryNote: o.delivery_note_number,
      invoice: o.invoice_number,
      status: o.status,
      lines: own,
      documents: (docsRes.data ?? [])
        .filter((d) => d.order_id === orderId)
        .map((d) => ({ name: d.file_name, url: link(d.storage_path) })),
    };
  };

  type LoadRow = {
    id: string;
    load_date: string;
    status: string;
    vehicle: { name: string; registration: string } | null;
    haulier: { name: string } | null;
    drivers: { driver: { name: string } | null }[];
  };
  const loads: HistoryLoad[] = ((loadsRes.data ?? []) as unknown as LoadRow[])
    .map((l) => ({
      id: l.id,
      date: l.load_date,
      title: l.vehicle?.name ?? l.haulier?.name ?? "No vehicle",
      subtitle: l.vehicle ? l.vehicle.registration : l.haulier ? "Haulier" : "",
      drivers: l.drivers
        .map((d) => d.driver?.name)
        .filter(Boolean)
        .join(", "),
      status: l.status,
      stops: stops
        .filter((s) => s.load_id === l.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({
          id: s.id,
          sequence: s.sequence,
          siteName: s.site?.name ?? "Site",
          postcode: s.site?.postcode ?? "",
          customerName: s.site?.customer?.name ?? "",
          status: s.status,
          hasPod: podStops.has(s.id),
          bookingRef: s.booking_ref,
          bookingSlot: s.booking_slot ? s.booking_slot.slice(0, 5) : null,
          confirmation: {
            confirmed: s.confirmed,
            by: s.confirmed_by,
            method: s.confirmation_method,
            at: s.confirmed_at,
            note: s.confirmation_note,
            attachmentUrl: link(s.confirmation_attachment_path),
          },
          orders: found
            .filter((r) => r.stop_id === s.id)
            .map((r) => toOrder(r.order_id, s.id))
            .filter((o): o is HistoryOrder => Boolean(o)),
        })),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  return {
    loads,
    orders: orderIds.length,
    deliveries: stopIds.length,
    units: unitTotals(unitLines),
    truncated,
  };
}
