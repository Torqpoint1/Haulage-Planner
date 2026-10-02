import type { SupabaseClient } from "@supabase/supabase-js";

/** One row in every settings table, created through the API as the organisation's admin. */
export type SettingsFixture = {
  depotId: string;
  unitTypeId: string;
  vehicleId: string;
  driverId: string;
  zoneId: string;
  haulierId: string;
  rateCardId: string;
};

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id as string;
}

export async function createSettings(admin: SupabaseClient, label: string, driverUserId?: string) {
  const depotId = await insert(admin, "depots", {
    name: `${label} factory`,
    postcode: "GL5 3AA",
    loading_equipment: ["forklift"],
    opening_hours: { mon: { open: "07:00", close: "17:00" } },
    is_default: true,
  });
  const unitTypeId = await insert(admin, "unit_types", {
    name: "Door pack",
    short_code: "DP",
    length_mm: 2200,
    width_mm: 1000,
    height_mm: 1200,
    typical_weight_kg: 140,
    must_stay_upright: true,
  });
  const vehicleId = await insert(admin, "vehicles", {
    name: "Luton 1",
    registration: "AB12 CDE",
    vehicle_type: "luton",
    deck_length_mm: 4000,
    deck_width_mm: 2000,
    deck_height_mm: 2100,
    payload_kg: 1000,
    gross_weight_kg: 3500,
    overall_length_m: 6.5,
    unload_methods: ["tail_lift"],
    tail_lift_max_kg: 750,
  });
  await insert(admin, "vehicle_capacities", {
    vehicle_id: vehicleId,
    unit_type_id: unitTypeId,
    max_units: 6,
  });
  const driverId = await insert(admin, "drivers", {
    name: "Dave Hughes",
    phone: "07700 900123",
    licence_categories: ["B", "C1"],
    user_id: driverUserId ?? null,
  });
  const zoneId = await insert(admin, "postcode_zones", {
    name: "Gloucestershire",
    postcode_areas: ["GL"],
  });
  const haulierId = await insert(admin, "hauliers", {
    name: "Severn Pallets",
    haulier_type: "pallet_network",
    coverage_areas: ["GL", "NP"],
  });
  const rateCardId = await insert(admin, "rate_cards", {
    haulier_id: haulierId,
    name: "2026 rates",
    valid_from: "2026-01-01",
    per_drop: 25,
  });
  await insert(admin, "rate_card_pallet_prices", {
    rate_card_id: rateCardId,
    zone_id: zoneId,
    pallet_size: "full",
    price: 42.5,
  });
  await insert(admin, "rate_card_load_prices", {
    rate_card_id: rateCardId,
    zone_id: zoneId,
    load_type: "full",
    price: 380,
  });
  return { depotId, unitTypeId, vehicleId, driverId, zoneId, haulierId, rateCardId };
}

/** Settings tables and a harmless change to try on each. */
export const SETTINGS_TABLES: { table: string; patch: Record<string, unknown> }[] = [
  { table: "depots", patch: { name: "Hijacked depot" } },
  { table: "unit_types", patch: { name: "Hijacked unit" } },
  { table: "vehicles", patch: { name: "Hijacked van" } },
  { table: "vehicle_capacities", patch: { max_units: 99 } },
  { table: "drivers", patch: { name: "Hijacked driver" } },
  { table: "postcode_zones", patch: { name: "Hijacked zone" } },
  { table: "hauliers", patch: { name: "Hijacked haulier" } },
  { table: "rate_cards", patch: { name: "Hijacked rates" } },
  { table: "rate_card_pallet_prices", patch: { price: 0 } },
  { table: "rate_card_load_prices", patch: { price: 0 } },
];

export type CustomerFixture = { customerId: string; siteId: string; contactId: string };

/** A customer with one site and one contact, created through the API. */
export async function createCustomer(
  client: SupabaseClient,
  label: string,
): Promise<CustomerFixture> {
  const customerId = await insert(client, "customers", {
    name: `${label} Builders`,
    account_ref: `${label.toUpperCase()}01`,
  });
  const siteId = await insert(client, "sites", {
    customer_id: customerId,
    name: `${label} yard`,
    postcode: "GL1 2BB",
    latitude: 51.86,
    longitude: -2.24,
    location_source: "postcode",
    no_hgvs: true,
    booking_required: true,
    booking_lead_hours: 24,
  });
  const contactId = await insert(client, "contacts", {
    customer_id: customerId,
    site_id: siteId,
    name: "Site manager",
    phone: "07700 900111",
  });
  const { error } = await client
    .from("postcode_lookups")
    .upsert(
      { postcode: "GL1 2BB", latitude: 51.86, longitude: -2.24 },
      { onConflict: "organisation_id,postcode" },
    );
  if (error) throw new Error(`postcode_lookups: ${error.message}`);
  return { customerId, siteId, contactId };
}

export const CUSTOMER_TABLES: { table: string; patch: Record<string, unknown> }[] = [
  { table: "customers", patch: { name: "Hijacked customer" } },
  { table: "sites", patch: { no_hgvs: false } },
  { table: "contacts", patch: { phone: "0" } },
  { table: "postcode_lookups", patch: { latitude: 50 } },
];
