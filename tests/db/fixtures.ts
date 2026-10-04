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
  const { data: line } = await client
    .from("order_lines")
    .select("id")
    .eq("order_id", order.orderId)
    .limit(1)
    .single();
  const { error: tickError } = await client.rpc("tick_line", {
    target_line: line!.id,
    set_picked: true,
  });
  if (tickError) throw new Error(`tick_line: ${tickError.message}`);
  const { error: legError } = await client
    .from("route_legs")
    .upsert(
      { from_key: "51.73600,-2.22400", to_key: "51.86142,-2.24412", miles: 11.4, minutes: 23 },
      { onConflict: "organisation_id,from_key,to_key" },
    );
  if (legError) throw new Error(`route_legs: ${legError.message}`);
  return { loadId, stopId: stopId as string, overrideId };
}

export const PLANNING_TABLES: { table: string; patch: Record<string, unknown> }[] = [
  { table: "loads", patch: { status: "confirmed" } },
  { table: "load_drivers", patch: { driver_id: "00000000-0000-0000-0000-000000000000" } },
  { table: "load_stops", patch: { booking_ref: "HIJACKED" } },
  { table: "stop_orders", patch: { order_id: "00000000-0000-0000-0000-000000000000" } },
  { table: "warning_overrides", patch: { reason: "Hijacked" } },
  { table: "compliance_zones", patch: { name: "Hijacked zone" } },
  { table: "route_legs", patch: { miles: 0 } },
  { table: "pick_lines", patch: { picked: false } },
  { table: "pods", patch: { received_by: "Hijacked" } },
  { table: "assets", patch: { notes: "Hijacked" } },
  { table: "asset_movements", patch: { note: "Hijacked" } },
  { table: "stop_assets", patch: { outcome: "done" } },
  { table: "standing_runs", patch: { name: "Hijacked run" } },
  { table: "standing_run_sites", patch: { position: 99 } },
  { table: "standing_run_days", patch: { run_date: "2030-01-01" } },
  { table: "pod_lines", patch: { delivered_quantity: 0 } },
];

export type PodFixture = { orderId: string; loadId: string; stopId: string; podId: string };

/**
 * A second order on its own confirmed load, delivered with a signed POD; through
 * the API. Kept apart from createLoad so that load stays editable.
 */
export async function createPod(
  client: SupabaseClient,
  label: string,
  settings: SettingsFixture,
  customer: CustomerFixture,
): Promise<PodFixture> {
  const { data: orderId, error } = await client.rpc("save_order", {
    target_order_id: null,
    order_data: {
      customer_id: customer.customerId,
      site_id: customer.siteId,
      order_ref: `${label.toUpperCase()}-2001`,
      required_date: "2026-10-12",
    },
    lines: [{ unit_type_id: settings.unitTypeId, quantity: 2, weight_per_unit_kg: 140 }],
  });
  if (error) throw new Error(`save_order: ${error.message}`);
  const loadId = await insert(client, "loads", {
    load_date: "2026-10-12",
    depot_id: settings.depotId,
    vehicle_id: settings.vehicleId,
  });
  await insert(client, "load_drivers", { load_id: loadId, driver_id: settings.driverId });
  const { data: stopId, error: addError } = await client.rpc("add_order_to_load", {
    target_load: loadId,
    target_order: orderId,
  });
  if (addError) throw new Error(`add_order_to_load: ${addError.message}`);
  await client.from("loads").update({ status: "confirmed" }).eq("id", loadId);
  const signature = await uploadPodFile(client, stopId as string, "signature.png");
  const { data: podId, error: podError } = await client.rpc("record_pod", {
    client_id: crypto.randomUUID(),
    target_stop: stopId,
    outcome: "delivered",
    received_by: "Jo Bloggs",
    signature_path: signature,
  });
  if (podError) throw new Error(`record_pod: ${podError.message}`);
  return { orderId: orderId as string, loadId, stopId: stopId as string, podId: podId as string };
}

/** Upload a small file to a stop's POD folder and return its path. */
export async function uploadPodFile(client: SupabaseClient, stopId: string, name: string) {
  const { data: stop } = await client
    .from("load_stops")
    .select("organisation_id")
    .eq("id", stopId)
    .single();
  const path = `${stop!.organisation_id}/pods/${stopId}/${crypto.randomUUID()}/${name}`;
  const { error } = await client.storage
    .from("organisation-files")
    .upload(path, new Blob(["image"]), { contentType: "image/png" });
  if (error) throw new Error(`upload: ${error.message}`);
  return path;
}

export type AssetFixture = { unitTypeId: string; atDepot: string; atCustomer: string };

/** A returnable unit type, one asset at the depot and one at the customer, planned for collection. */
export async function createAssets(
  client: SupabaseClient,
  label: string,
  settings: SettingsFixture,
  customer: CustomerFixture,
  load: LoadFixture,
): Promise<AssetFixture> {
  const unitTypeId = await insert(client, "unit_types", {
    name: `Stillage ${label}`,
    short_code: `${label.slice(0, 2).toUpperCase()}ST`,
    length_mm: 1200,
    width_mm: 1000,
    height_mm: 1500,
    returnable: true,
    return_days: 28,
  });
  const atDepot = await insert(client, "assets", {
    unit_type_id: unitTypeId,
    asset_number: `${label.toUpperCase()}-S1`,
    depot_id: settings.depotId,
  });
  const atCustomer = await insert(client, "assets", {
    unit_type_id: unitTypeId,
    asset_number: `${label.toUpperCase()}-S2`,
    status: "at_customer",
    customer_id: customer.customerId,
    site_id: customer.siteId,
    dropped_on: "2026-09-01",
    expected_return_date: "2026-09-29",
  });
  const { error } = await client.rpc("add_collection", {
    target_load: load.loadId,
    asset_ids: [atCustomer],
  });
  if (error) throw new Error(`add_collection: ${error.message}`);
  return { unitTypeId, atDepot, atCustomer };
}

/** A standing run every day of the week, and this week's draft loads for it. */
export async function createStandingRun(
  client: SupabaseClient,
  label: string,
  settings: SettingsFixture,
  customer: CustomerFixture,
) {
  const { data: runId, error } = await client.rpc("save_standing_run", {
    target_id: null,
    run: {
      name: `${label} daily`,
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      cutoff_time: "12:00",
      start_time: "07:00",
      depot_id: settings.depotId,
      vehicle_id: settings.vehicleId,
      driver_id: settings.driverId,
    },
    site_ids: [customer.siteId],
  });
  if (error) throw new Error(`save_standing_run: ${error.message}`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const { error: genError } = await client.rpc("generate_standing_loads", {
    from_date: today,
    to_date: today,
  });
  if (genError) throw new Error(`generate_standing_loads: ${genError.message}`);
  return runId as string;
}
