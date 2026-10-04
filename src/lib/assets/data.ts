import "server-only";
import { formatIsoDate, fromIsoDate, londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import type { AssetStatus } from "./options";

/** One returnable asset with where it is, in words (spec 6.11). */
export type AssetRow = {
  id: string;
  assetNumber: string;
  unitTypeId: string;
  unitTypeName: string;
  status: AssetStatus;
  /** "Stroud factory", "Hillside Builders · Stroud yard", "Luton 1 on 03/10/2026". */
  where: string;
  depotId: string | null;
  customerId: string | null;
  siteId: string | null;
  loadId: string | null;
  loadDate: string | null;
  droppedOn: string | null;
  expectedReturn: string | null;
  /** Days past the expected return date; 0 when not overdue. */
  daysOverdue: number;
  notes: string;
};

export type AssetMovement = {
  id: string;
  at: string;
  from: string;
  to: string;
  by: string | null;
  note: string;
  loadId: string | null;
  loadDate: string | null;
};

export type AssetRegister = {
  assets: AssetRow[];
  unitTypes: { id: string; name: string; returnDays: number | null }[];
  depots: { id: string; name: string }[];
  sites: { id: string; name: string; customerName: string; postcode: string }[];
};

const days = (from: string, to: string) =>
  Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);

type Names = {
  depots: Map<string, string>;
  sites: Map<string, { name: string; customer: string; postcode: string }>;
  loads: Map<string, { title: string; date: string }>;
};

function place(
  status: string,
  ids: { depot: string | null; site: string | null; load: string | null },
  names: Names,
): string {
  if (status === "at_depot") return names.depots.get(ids.depot ?? "") ?? "Depot";
  if (status === "at_customer") {
    const s = names.sites.get(ids.site ?? "");
    return s ? `${s.customer} · ${s.name}` : "Customer";
  }
  if (status === "on_vehicle") {
    const l = names.loads.get(ids.load ?? "");
    return l ? `${l.title} on ${formatIsoDate(l.date)}` : "On a vehicle";
  }
  return status === "lost" ? "Lost" : "Retired";
}

async function lookups(loadIds: string[]): Promise<Names> {
  const supabase = await createClient();
  const [{ data: depots }, { data: sites }, { data: loads }] = await Promise.all([
    supabase.from("depots").select("id, name"),
    supabase.from("sites").select("id, name, postcode, customer:customers(name)"),
    loadIds.length
      ? supabase
          .from("loads")
          .select("id, load_date, vehicle:vehicles(name), haulier:hauliers(name)")
          .in("id", loadIds)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    depots: new Map((depots ?? []).map((d) => [d.id, d.name])),
    sites: new Map(
      (sites ?? []).map((s) => [
        s.id,
        {
          name: s.name,
          postcode: s.postcode,
          customer: (s.customer as unknown as { name: string } | null)?.name ?? "",
        },
      ]),
    ),
    loads: new Map(
      (
        (loads ?? []) as unknown as {
          id: string;
          load_date: string;
          vehicle: { name: string } | null;
          haulier: { name: string } | null;
        }[]
      ).map((l) => [
        l.id,
        { title: l.vehicle?.name ?? l.haulier?.name ?? "Load", date: l.load_date },
      ]),
    ),
  };
}

/** Every asset, overdue first, with the choices the register's forms need. */
export async function loadAssetRegister(filter?: { customerId?: string }): Promise<AssetRegister> {
  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select(
      "id, asset_number, unit_type_id, status, depot_id, customer_id, site_id, load_id, dropped_on, expected_return_date, notes, unit_type:unit_types(name)",
    )
    .order("asset_number");
  if (filter?.customerId) query = query.eq("customer_id", filter.customerId);
  const [{ data: rows, error }, { data: types }] = await Promise.all([
    query,
    supabase
      .from("unit_types")
      .select("id, name, return_days")
      .eq("returnable", true)
      .order("name"),
  ]);
  if (error) throw new Error(`Assets: ${error.message}`);
  const names = await lookups([
    ...new Set((rows ?? []).map((r) => r.load_id).filter(Boolean)),
  ] as string[]);
  const today = londonToday();
  const assets: AssetRow[] = (rows ?? []).map((r) => {
    const overdue =
      r.status === "at_customer" && r.expected_return_date && r.expected_return_date < today
        ? days(r.expected_return_date, today)
        : 0;
    return {
      id: r.id,
      assetNumber: r.asset_number,
      unitTypeId: r.unit_type_id,
      unitTypeName: (r.unit_type as unknown as { name: string } | null)?.name ?? "Asset",
      status: r.status as AssetStatus,
      where: place(r.status, { depot: r.depot_id, site: r.site_id, load: r.load_id }, names),
      depotId: r.depot_id,
      customerId: r.customer_id,
      siteId: r.site_id,
      loadId: r.load_id,
      loadDate: r.load_id ? (names.loads.get(r.load_id)?.date ?? null) : null,
      droppedOn: r.dropped_on,
      expectedReturn: r.expected_return_date,
      daysOverdue: overdue,
      notes: r.notes,
    };
  });
  assets.sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      a.assetNumber.localeCompare(b.assetNumber, "en-GB", { numeric: true }),
  );
  return {
    assets,
    unitTypes: (types ?? []).map((t) => ({ id: t.id, name: t.name, returnDays: t.return_days })),
    depots: [...names.depots].map(([id, name]) => ({ id, name })),
    sites: [...names.sites]
      .map(([id, s]) => ({ id, name: s.name, customerName: s.customer, postcode: s.postcode }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.name.localeCompare(b.name)),
  };
}

/** Where an asset has been, newest first. */
export async function loadAssetMovements(assetId: string): Promise<AssetMovement[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("asset_movements")
    .select(
      "id, from_status, to_status, from_depot_id, from_site_id, to_depot_id, to_site_id, load_id, note, moved_at, moved_by",
    )
    .eq("asset_id", assetId)
    .order("moved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  const list = rows ?? [];
  const names = await lookups([...new Set(list.map((r) => r.load_id).filter(Boolean))] as string[]);
  const people = [...new Set(list.map((r) => r.moved_by).filter(Boolean))] as string[];
  const { data: profiles } = people.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", people)
    : { data: [] };
  const who = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  return list.map((r) => ({
    id: r.id,
    at: r.moved_at,
    from: r.from_status
      ? place(
          r.from_status,
          { depot: r.from_depot_id, site: r.from_site_id, load: r.load_id },
          names,
        )
      : "Added",
    to: place(r.to_status, { depot: r.to_depot_id, site: r.to_site_id, load: r.load_id }, names),
    by: r.moved_by ? (who.get(r.moved_by) ?? null) : null,
    note: r.note,
    loadId: r.load_id,
    loadDate: r.load_id ? (names.loads.get(r.load_id)?.date ?? null) : null,
  }));
}
