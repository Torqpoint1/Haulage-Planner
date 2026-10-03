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
  });
  const unitTypeId = await insert(admin, "unit_types", {
    name: `Door pack ${label}`,
    short_code: `${label.slice(0, 3).toUpperCase()}DP`,
    length_mm: 2200,
    width_mm: 1000,
    height_mm: 1200,
    typical_weight_kg: 140,
    must_stay_upright: true,
  });
  const vehicleId = await insert(admin, "vehicles", {
    name: `Luton ${label}`,
    registration: `AB12 ${label.slice(0, 3).toUpperCase()}`,
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
    name: `Gloucestershire ${label}`,
    postcode_areas: ["GL"],
  });
  const haulierId = await insert(admin, "hauliers", {
    name: `Severn Pallets ${label}`,
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

export type OrderFixture = { orderId: string; quoteRequestId: string };

/** An order with one line, a document record, a quote request and an import mapping. */
export async function createOrder(
  client: SupabaseClient,
  label: string,
  settings: SettingsFixture,
  customer: CustomerFixture,
): Promise<OrderFixture> {
  const { data: orderId, error } = await client.rpc("save_order", {
    target_order_id: null,
    order_data: {
      customer_id: customer.customerId,
      site_id: customer.siteId,
      order_ref: `${label.toUpperCase()}-1001`,
      customer_po: `PO-${label}-77`,
      delivery_note_number: `DN-${label}-55`,
      invoice_number: `INV-${label}-33`,
      required_date: "2026-10-12",
    },
    lines: [{ unit_type_id: settings.unitTypeId, quantity: 4, weight_per_unit_kg: 140 }],
  });
  if (error) throw new Error(`save_order: ${error.message}`);
  const { data: order } = await client
    .from("orders")
    .select("organisation_id")
    .eq("id", orderId)
    .single();
  await insert(client, "order_attachments", {
    order_id: orderId,
    storage_path: `${order!.organisation_id}/orders/${orderId}/delivery-note.pdf`,
    file_name: "delivery-note.pdf",
    content_type: "application/pdf",
    size_bytes: 1024,
  });
  const quoteRequestId = await insert(client, "quote_requests", { haulier_id: settings.haulierId });
  await insert(client, "quote_request_orders", {
    quote_request_id: quoteRequestId,
    order_id: orderId,
  });
  const { error: mapError } = await client
    .from("csv_import_mappings")
    .upsert(
      { import_type: "orders", mapping: { order_ref: "Order No" } },
      { onConflict: "organisation_id,import_type" },
    );
  if (mapError) throw new Error(`csv_import_mappings: ${mapError.message}`);
  return { orderId: orderId as string, quoteRequestId };
}

export const ORDER_TABLES: { table: string; patch: Record<string, unknown> }[] = [
  { table: "orders", patch: { readiness: "ready" } },
  { table: "order_lines", patch: { quantity: 999 } },
  { table: "order_attachments", patch: { file_name: "hijacked.pdf" } },
  { table: "quote_requests", patch: { status: "accepted" } },
  { table: "quote_request_orders", patch: { order_id: "00000000-0000-0000-0000-000000000000" } },
  { table: "csv_import_mappings", patch: { mapping: {} } },
];

export type LoadFixture = { loadId: string; stopId: string; overrideId: string };

/** A load with a driver, one stop carrying the order, and an override; through the API. */
export async function createLoad(
  client: SupabaseClient,
  settings: SettingsFixture,
  order: OrderFixture,
): Promise<LoadFixture> {
  const loadId = await insert(client, "loads", {
    load_date: "2026-10-12",
    depot_id: settings.depotId,
    vehicle_id: settings.vehicleId,
  });
  await insert(client, "load_drivers", { load_id: loadId, driver_id: settings.driverId });
  const { data: stopId, error } = await client.rpc("add_order_to_load", {
    target_load: loadId,
    target_order: order.orderId,
  });
  if (error) throw new Error(`add_order_to_load: ${error.message}`);
  const overrideId = await insert(client, "warning_overrides", {
    load_id: loadId,
    warning_key: `ORDER_NOT_READY:order:${order.orderId}`,
    code: "ORDER_NOT_READY",
    entity_type: "order",
    entity_id: order.orderId,
    kind: "override",
    reason: "Production will finish first thing.",
  });
  return { loadId, stopId: stopId as string, overrideId };
}

export const PLANNING_TABLES: { table: string; patch: Record<string, unknown> }[] = [
  { table: "loads", patch: { status: "confirmed" } },
  { table: "load_drivers", patch: { driver_id: "00000000-0000-0000-0000-000000000000" } },
  { table: "load_stops", patch: { booking_ref: "HIJACKED" } },
  { table: "stop_orders", patch: { order_id: "00000000-0000-0000-0000-000000000000" } },
  { table: "warning_overrides", patch: { reason: "Hijacked" } },
  { table: "compliance_zones", patch: { name: "Hijacked zone" } },
];
