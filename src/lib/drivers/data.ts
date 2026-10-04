import "server-only";
import { londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadSheets } from "@/lib/warehouse/data";
import type { DriverRun, PodSummary, RunLoad, RunStop } from "./types";

/** Load statuses a driver sees; drafts aren't ready for them. */
const VISIBLE = ["planned", "confirmed", "loading", "out", "complete"] as const;

/**
 * A driver's run for a day (spec 9.8): their loads, stops in drop order, and
 * what they need at each one. `driverId` picks a driver for admins; everyone
 * else sees the driver linked to their own login.
 */
export async function loadDriverRun(opts: {
  userId: string;
  isAdmin: boolean;
  driverId?: string | null;
  date?: string;
}): Promise<DriverRun> {
  const date = opts.date ?? londonToday();
  const supabase = await createClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, name, user_id")
    .eq("active", true)
    .order("name");
  const own = (drivers ?? []).find((d) => d.user_id === opts.userId) ?? null;
  const picked =
    opts.isAdmin && opts.driverId ? drivers?.find((d) => d.id === opts.driverId) : null;
  const driver = picked ?? own;
  const choices = opts.isAdmin ? (drivers ?? []).map((d) => ({ id: d.id, name: d.name })) : null;
  if (!driver) return { date, driver: null, drivers: choices, loads: [] };

  const { data: assigned } = await supabase
    .from("load_drivers")
    .select("load_id, loads!inner(load_date, status)")
    .eq("driver_id", driver.id)
    .eq("loads.load_date", date);
  const loadIds = new Set(
    (assigned ?? [])
      .filter((a) => {
        const load = a.loads as unknown as { status: string };
        return (VISIBLE as readonly string[]).includes(load.status);
      })
      .map((a) => a.load_id as string),
  );
  if (!loadIds.size) {
    return { date, driver: { id: driver.id, name: driver.name }, drivers: choices, loads: [] };
  }

  const sheets = await loadSheets(date);
  const mine = sheets.loads.filter((l) => loadIds.has(l.id));
  const stopIds = mine.flatMap((l) => l.stops.map((s) => s.id));
  const [{ data: stopRows }, { data: podRows }] = await Promise.all([
    supabase
      .from("load_stops")
      .select(
        "id, status, eta_from, eta_to, sites(customer_id, latitude, longitude, delivery_instructions, parking_note, narrow_access_note, ppe_required, induction_required, contact_must_be_present)",
      )
      .in("id", stopIds),
    supabase
      .from("pods")
      .select("stop_id, outcome, received_by, failure_reason, note, recorded_at")
      .in("stop_id", stopIds),
  ]);
  type SiteExtra = {
    customer_id: string;
    latitude: number | null;
    longitude: number | null;
    delivery_instructions: string;
    parking_note: string;
    narrow_access_note: string;
    ppe_required: boolean;
    induction_required: boolean;
    contact_must_be_present: boolean;
  };
  const stopsById = new Map(
    (stopRows ?? []).map((s) => [
      s.id,
      s as unknown as {
        status: RunStop["status"];
        eta_from: string | null;
        eta_to: string | null;
        sites: SiteExtra | null;
      },
    ]),
  );
  // Contacts for the whole customer (not tied to one site) are useful at every stop.
  const customerIds = [
    ...new Set([...stopsById.values()].map((s) => s.sites?.customer_id).filter(Boolean)),
  ] as string[];
  const { data: customerContacts } = customerIds.length
    ? await supabase
        .from("contacts")
        .select("name, phone, customer_id")
        .in("customer_id", customerIds)
        .is("site_id", null)
    : { data: [] };
  const pods = new Map<string, PodSummary>(
    (podRows ?? []).map((p) => [
      p.stop_id,
      {
        outcome: p.outcome,
        receivedBy: p.received_by,
        failureReason: p.failure_reason,
        note: p.note,
        recordedAt: p.recorded_at,
      },
    ]),
  );

  const loads: RunLoad[] = mine.map((load) => {
    const sections = new Map(load.sections.map((s) => [s.stop.id, s]));
    return {
      id: load.id,
      title: load.title,
      subtitle: load.subtitle,
      status: load.status as RunLoad["status"],
      startTime: load.startTime,
      crew: load.crew,
      depot: load.depot ? { name: load.depot.name, postcode: load.depot.postcode } : null,
      notes: load.notes,
      stops: load.stops.map((stop) => {
        const extra = stopsById.get(stop.id);
        const site = extra?.sites;
        const section = sections.get(stop.id);
        const orders = (section?.orders ?? []).map((o) => ({
          id: o.id,
          order_ref: o.order_ref,
          customer_name: o.customer_name,
          customer_po: o.customer_po,
          delivery_note_number: o.delivery_note_number,
          lines: o.lines.map((l) => ({
            id: l.id,
            quantity: l.quantity,
            description: l.description,
            unitName: l.unitName,
            unitCode: l.unitCode,
            handling: l.handling,
          })),
        }));
        const siteNotes = [
          site?.narrow_access_note.trim() ? `Access: ${site.narrow_access_note.trim()}` : "",
          site?.parking_note.trim() ? `Parking: ${site.parking_note.trim()}` : "",
          site?.ppe_required ? "PPE required" : "",
          site?.induction_required ? "Site induction required" : "",
          site?.contact_must_be_present ? "Contact must be present" : "",
        ].filter(Boolean);
        return {
          id: stop.id,
          sequence: stop.sequence,
          status: extra?.status ?? "pending",
          site: {
            name: stop.site.name,
            address: stop.site.address,
            postcode: stop.site.postcode,
            latitude: site?.latitude ?? null,
            longitude: site?.longitude ?? null,
          },
          customers: [...new Set(orders.map((o) => o.customer_name))],
          eta: stop.eta,
          bookingRef: stop.bookingRef,
          bookingSlot: stop.bookingSlot,
          etaFrom: extra?.eta_from ?? null,
          etaTo: extra?.eta_to ?? null,
          contacts: [
            ...stop.contacts,
            ...(customerContacts ?? [])
              .filter((c) => c.customer_id === site?.customer_id)
              .map((c) => ({ name: c.name, phone: c.phone })),
          ].filter((c) => c.phone.trim() || c.name.trim()),
          instructions: [
            ...new Set(
              [site?.delivery_instructions.trim() ?? "", ...stop.instructions].filter(Boolean),
            ),
          ],
          siteNotes,
          handling: [...new Set(orders.flatMap((o) => o.lines.flatMap((l) => l.handling)))],
          orders,
          assets: stop.assets
            .filter((a) => a.outcome === "pending" || a.outcome === "done")
            .map((a) => ({ id: a.id, label: a.label, direction: a.direction })),
          pod: pods.get(stop.id) ?? null,
        };
      }),
    };
  });
  return { date, driver: { id: driver.id, name: driver.name }, drivers: choices, loads };
}
