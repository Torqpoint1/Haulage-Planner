import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../../tests/support/local-supabase";

/** Test accounts are created through the admin API so tests don't depend on each other. */

export const PASSWORD = "correct-horse-battery";
const env = localSupabase();
const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const service = createClient(env.apiUrl, env.secretKey, options);

/** This run's demo company (each run creates its own; the newest is this run's). */
async function currentOrgId() {
  const { data } = await service
    .from("organisations")
    .select("id")
    .eq("name", "Example Doors Ltd")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data!.id as string;
}

/**
 * A planned load today to Cheltenham showroom (where ST-201/ST-202 are
 * overdue) with Gareth Morgan driving, for the assets test. Arranged directly
 * so the test can focus on what the planner and driver do.
 */
export async function createAssetLoad() {
  const client = await adminClient();
  const today = isoInDays(0);
  const one = async (table: string, column: string, value: string) =>
    (
      (await client.from(table).select("id").eq(column, value).limit(1).single()).data as {
        id: string;
      }
    ).id;
  const { data: site } = await client
    .from("sites")
    .select("id, customer_id")
    .eq("name", "Cheltenham showroom")
    .single();
  const [unit, depot, vehicle, driver] = await Promise.all([
    one("unit_types", "short_code", "DP"),
    one("depots", "name", "Stroud factory"),
    one("vehicles", "name", "7.5t curtainsider"),
    one("drivers", "name", "Gareth Morgan"),
  ]);
  const { data: orderId, error } = await client.rpc("save_order", {
    target_order_id: null,
    order_data: {
      customer_id: site!.customer_id,
      site_id: site!.id,
      order_ref: "AS-701",
      required_date: today,
      readiness: "ready",
    },
    lines: [{ unit_type_id: unit, quantity: 2, weight_per_unit_kg: 140 }],
  });
  if (error) throw new Error(`AS-701: ${error.message}`);
  const [loadId] = await insert(client, "loads", [
    { load_date: today, depot_id: depot, vehicle_id: vehicle },
  ]);
  const added = await client.rpc("add_order_to_load", {
    target_load: loadId,
    target_order: orderId,
  });
  if (added.error) throw new Error(`add AS-701: ${added.error.message}`);
  await insert(client, "load_drivers", [{ load_id: loadId, driver_id: driver }]);
  return { loadId, driverId: driver, today };
}

/** Signed in as this run's demo admin, so writes go through the same rules as the app. */
async function adminClient() {
  const { adminEmail } = JSON.parse(readFileSync("e2e/.auth/company.json", "utf8")) as {
    adminEmail: string;
  };
  const client = createClient(env.apiUrl, env.publishableKey, options);
  const { error } = await client.auth.signInWithPassword({ email: adminEmail, password: PASSWORD });
  if (error) throw error;
  return client;
}

/** Confirm a load, as a planner would once happy with it. */
export async function confirmLoad(loadId: string) {
  const { error } = await (
    await adminClient()
  )
    .from("loads")
    .update({ status: "confirmed" })
    .eq("id", loadId);
  if (error) throw new Error(`confirm: ${error.message}`);
}

/** Where an asset is now, as stored. */
export async function assetState(assetNumber: string) {
  const org = await currentOrgId();
  const { data } = await service
    .from("assets")
    .select("status, site_id, depot_id, load_id, dropped_on, expected_return_date")
    .eq("organisation_id", org)
    .eq("asset_number", assetNumber)
    .single();
  return data!;
}

/**
 * A customer with one site and an unplanned order (SR-601) that only the
 * standing runs test uses, so its suggestions don't depend on other tests.
 */
export async function createStandingRunCase() {
  const client = await adminClient();
  const [customer] = await insert(client, "customers", [
    { name: "Wolds Garden Supplies", account_ref: "WGS1" },
  ]);
  const [site] = await insert(client, "sites", [
    {
      customer_id: customer,
      name: "Wolds garden centre",
      postcode: "GL54 2AB",
      latitude: 51.8846,
      longitude: -1.7556,
      location_source: "postcode",
      site_equipment: ["forklift"],
      last_verified_at: new Date().toISOString(),
    },
  ]);
  const { data: unit } = await client
    .from("unit_types")
    .select("id")
    .eq("short_code", "EUR")
    .single();
  const { error } = await client.rpc("save_order", {
    target_order_id: null,
    order_data: {
      customer_id: customer,
      site_id: site,
      order_ref: "SR-601",
      required_date: isoInDays(7),
      readiness: "ready",
    },
    lines: [{ unit_type_id: unit!.id, quantity: 3, weight_per_unit_kg: 300 }],
  });
  if (error) throw new Error(`SR-601: ${error.message}`);
}

/** Today's driver run as stored: for checking what reached the database, never for arranging UI state. */
export async function driverRunRecords() {
  // Each run creates its own demo company; the newest is this run's.
  const { data: org } = await service
    .from("organisations")
    .select("id")
    .eq("name", "Example Doors Ltd")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const { data: orders, error } = await service
    .from("orders")
    .select("id, order_ref, status")
    .eq("organisation_id", org!.id)
    .like("order_ref", "DR-4%")
    .order("order_ref");
  if (error) throw error;
  const { data: links } = await service
    .from("stop_orders")
    .select("stop_id")
    .in(
      "order_id",
      (orders ?? []).map((o) => o.id),
    );
  const stopIds = (links ?? []).map((l) => l.stop_id as string);
  const { data: pods } = stopIds.length
    ? await service
        .from("pods")
        .select("stop_id, outcome, photo_paths, signature_path")
        .in("stop_id", stopIds)
    : { data: [] };
  const { data: stop } = stopIds.length
    ? await service.from("load_stops").select("load_id").eq("id", stopIds[0]).single()
    : { data: null };
  const loadId = stop?.load_id as string | undefined;
  return { orders: orders ?? [], pods: pods ?? [], loadId };
}

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function createAccount(fullName: string, email = uniqueEmail("user")) {
  const { error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  const client = createClient(env.apiUrl, env.publishableKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { email, client };
}

/** A company with an admin, plus members who joined by invitation. */
export async function createCompany(
  name: string,
  adminName: string,
  members: { name: string; role: "planner" | "warehouse" | "driver" | "office" }[] = [],
) {
  const admin = await createAccount(adminName, uniqueEmail("admin"));
  const { error } = await admin.client.rpc("create_organisation", { organisation_name: name });
  if (error) throw error;
  const created: Record<string, string> = {};
  for (const m of members) {
    const user = await createAccount(m.name, uniqueEmail(m.role));
    const { data, error: inviteError } = await admin.client
      .rpc("create_invitation", { invite_email: user.email, invite_role: m.role })
      .single<{ token: string }>();
    if (inviteError) throw inviteError;
    const { error: acceptError } = await user.client.rpc("accept_invitation", {
      invite_token: data.token,
    });
    if (acceptError) throw acceptError;
    // The first member with a role is the one tests sign in as.
    created[m.role] ??= user.email;
  }
  await seedSettings(admin.client);
  await seedCustomers(admin.client);
  await seedOrders(admin.client);
  await seedPlanning(admin.client);
  await seedDriverRun(admin.client);
  await seedHistory(admin.client);
  await seedReports(admin.client);
  await seedAssets(admin.client);
  return { adminEmail: admin.email, members: created };
}

type Client = Awaited<ReturnType<typeof createAccount>>["client"];

async function insert(client: Client, table: string, rows: Record<string, unknown>[]) {
  const { data, error } = await client
    .from(table)
    .insert(rows, { defaultToNull: false })
    .select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.map((r) => r.id as string);
}

/** Realistic settings for the demo company (fictional data, spec 13). */
async function seedSettings(client: Client) {
  const weekday = { open: "07:00", close: "17:00" };
  await insert(client, "depots", [
    {
      name: "Stroud factory",
      address: "Unit 4, Bath Road Trading Estate, Stroud",
      postcode: "GL5 3QF",
      latitude: 51.736,
      longitude: -2.224,
      loading_equipment: ["forklift", "loading_dock"],
      opening_hours: {
        mon: weekday,
        tue: weekday,
        wed: weekday,
        thu: weekday,
        fri: { open: "07:00", close: "15:00" },
      },
      is_default: true,
    },
  ]);
  const [doorPack, euro, ukPallet, longLength] = await insert(client, "unit_types", [
    {
      name: "Door pack",
      short_code: "DP",
      colour_tag: "load-2",
      length_mm: 2200,
      width_mm: 1000,
      height_mm: 1200,
      typical_weight_kg: 140,
      must_stay_upright: true,
      requires_two_people: true,
      min_unload_method: "forklift",
    },
    {
      name: "Euro pallet",
      short_code: "EUR",
      colour_tag: "load-1",
      length_mm: 1200,
      width_mm: 800,
      height_mm: 1200,
      typical_weight_kg: 300,
    },
    {
      name: "UK pallet",
      short_code: "UKP",
      colour_tag: "load-3",
      length_mm: 1200,
      width_mm: 1000,
      height_mm: 1200,
      typical_weight_kg: 400,
    },
    {
      name: "Long length",
      short_code: "LL",
      colour_tag: "load-5",
      length_mm: 4800,
      width_mm: 300,
      height_mm: 300,
      typical_weight_kg: 60,
      stackable: true,
      max_stack_height: 4,
    },
  ]);
  const [luton, sevenFive, eighteen] = await insert(client, "vehicles", [
    {
      name: "Luton 1",
      registration: "WX21 KLM",
      vehicle_type: "luton",
      deck_length_mm: 4000,
      deck_width_mm: 2000,
      deck_height_mm: 2100,
      payload_kg: 1000,
      gross_weight_kg: 3500,
      overall_length_m: 6.7,
      unload_methods: ["tail_lift"],
      tail_lift_max_kg: 750,
      cost_per_mile: 0.62,
      cost_per_driver_hour: 16,
      euro_standard: "Euro 6",
      caz_compliant: true,
    },
    {
      name: "7.5t curtainsider",
      registration: "YK70 PQR",
      vehicle_type: "7.5t",
      deck_length_mm: 6100,
      deck_width_mm: 2450,
      deck_height_mm: 2400,
      payload_kg: 2600,
      gross_weight_kg: 7500,
      overall_length_m: 8.4,
      unload_methods: ["side", "rear"],
      cost_per_mile: 0.95,
      cost_per_driver_hour: 17.5,
      euro_standard: "Euro 6",
      caz_compliant: false,
    },
    {
      name: "18t curtainsider",
      registration: "AB19 XYZ",
      vehicle_type: "18t",
      deck_length_mm: 7300,
      deck_width_mm: 2480,
      deck_height_mm: 2600,
      payload_kg: 9500,
      gross_weight_kg: 18000,
      overall_length_m: 10.1,
      unload_methods: ["side", "rear"],
      cost_per_mile: 1.35,
      cost_per_driver_hour: 19,
      crew_size_default: 2,
      euro_standard: "Euro 6",
      london_hgv_permit: true,
      london_hgv_permit_expires: "2027-03-31",
      caz_compliant: true,
    },
  ]);
  const caps = (vehicle: string, list: [string, number][]) =>
    list.map(([unit, max]) => ({ vehicle_id: vehicle, unit_type_id: unit, max_units: max }));
  await insert(client, "vehicle_capacities", [
    ...caps(luton, [
      [doorPack, 6],
      [euro, 4],
      [ukPallet, 3],
    ]),
    ...caps(sevenFive, [
      [doorPack, 12],
      [euro, 12],
      [ukPallet, 10],
      [longLength, 20],
    ]),
    ...caps(eighteen, [
      [doorPack, 22],
      [euro, 18],
      [ukPallet, 16],
      [longLength, 40],
    ]),
  ]);
  await insert(client, "drivers", [
    {
      name: "Dave Hughes",
      phone: "07700 900123",
      licence_categories: ["B", "C1", "C"],
      available_days: ["mon", "tue", "wed", "thu", "fri"],
    },
    {
      name: "Gareth Morgan",
      phone: "07700 900456",
      licence_categories: ["B", "C1"],
      available_days: ["mon", "tue", "wed", "thu"],
    },
  ]);
  const [west, wales, midlands] = await insert(client, "postcode_zones", [
    { name: "Gloucestershire", colour_tag: "load-1", postcode_areas: ["GL"] },
    { name: "South Wales", colour_tag: "load-3", postcode_areas: ["CF", "NP", "SA"] },
    { name: "Midlands", colour_tag: "load-5", postcode_areas: ["B", "CV", "WR"] },
  ]);
  const [pallets, cotswold] = await insert(client, "hauliers", [
    {
      name: "Severn Pallet Network",
      haulier_type: "pallet_network",
      contact_name: "Jo Price",
      phone: "01452 000111",
      email: "bookings@severn-pallets.example",
      coverage_areas: ["GL", "NP", "CF", "B"],
      services: ["tail_lift", "timed"],
      rating: 4,
    },
    {
      name: "Cotswold Haulage",
      haulier_type: "haulier",
      phone: "01285 000222",
      coverage_areas: ["GL", "OX", "SN"],
      services: ["tail_lift", "two_person"],
      vehicle_types: ["18t", "artic"],
      rating: 5,
    },
  ]);
  const [card] = await insert(client, "rate_cards", [
    {
      haulier_id: pallets,
      name: "2026 tariff",
      valid_from: "2026-01-01",
      per_drop: 0,
      extra_drop: 12,
      surcharge_tail_lift_per_pallet: 6,
      surcharge_timed: 15,
      waiting_per_hour: 35,
      waiting_free_minutes: 30,
    },
  ]);
  // A haulier priced by the load rather than the pallet (spec 6.5).
  const [cotswoldCard] = await insert(client, "rate_cards", [
    {
      haulier_id: cotswold,
      name: "Cotswold 2026",
      valid_from: "2026-01-01",
      per_drop: 25,
      extra_drop: 15,
    },
  ]);
  await insert(client, "rate_card_load_prices", [
    { rate_card_id: cotswoldCard, zone_id: west, load_type: "part", price: 165 },
    { rate_card_id: cotswoldCard, zone_id: west, load_type: "full", price: 295 },
  ]);
  const prices = (zone: string, q: number, h: number, f: number) =>
    (["quarter", "half", "full"] as const).map((size, i) => ({
      rate_card_id: card,
      zone_id: zone,
      pallet_size: size,
      price: [q, h, f][i],
    }));
  await insert(client, "rate_card_pallet_prices", [
    ...prices(west, 28, 34, 42.5),
    ...prices(wales, 31, 38, 47),
    ...prices(midlands, 33, 40, 49.5),
  ]);
}

/** Fictional customers with a realistic mix of site restrictions (spec 13). */
async function seedCustomers(client: Client) {
  const [hillside, marlow, severn, oakfield] = await insert(client, "customers", [
    {
      name: "Hillside Builders",
      account_ref: "HB001",
      default_delivery_instructions: "Call 30 minutes before arrival.",
    },
    { name: "Marlow Joinery", account_ref: "MJ014" },
    {
      name: "Severn Timber Merchants",
      account_ref: "STM07",
      notes: "Pay on account. Prefers morning deliveries.",
    },
    { name: "Oakfield Homes", account_ref: "OAK22" },
  ]);
  const weekday = { open: "07:30", close: "16:30" };
  const week = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday };
  const recently = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const [, marlowSite] = await insert(client, "sites", [
    {
      customer_id: hillside,
      name: "Stroud yard",
      postcode: "GL5 3QF",
      latitude: 51.73602,
      longitude: -2.22381,
      location_source: "postcode",
      address: "Hillside Yard, London Road, Stroud",
      site_equipment: ["forklift"],
      opening_hours: week,
      last_verified_at: recently,
    },
    {
      customer_id: marlow,
      name: "Gloucester workshop",
      postcode: "GL1 2BB",
      latitude: 51.86142,
      longitude: -2.24412,
      location_source: "postcode",
      address: "Unit 7, Bristol Road, Gloucester",
      handball_allowed: true,
      handball_people: 2,
      no_hgvs: true,
      narrow_access_note: "Narrow lane; reverse in from the main road.",
      opening_hours: week,
      last_verified_at: "2025-11-04T10:00:00Z",
    },
    {
      customer_id: severn,
      name: "Newport depot",
      postcode: "NP20 4AA",
      latitude: 51.58731,
      longitude: -2.99771,
      location_source: "postcode",
      site_equipment: ["forklift", "moffett"],
      booking_required: true,
      booking_lead_hours: 24,
      how_to_book: "Email goods-in with the PO number.",
      ppe_required: true,
      opening_hours: week,
      delivery_windows: {
        mon: { open: "07:30", close: "11:00" },
        tue: { open: "07:30", close: "11:00" },
      },
      last_verified_at: recently,
    },
    {
      customer_id: oakfield,
      name: "Plot 14, Meadow View",
      postcode: "SN1 4DD",
      latitude: 51.56291,
      longitude: -1.78104,
      location_source: "postcode",
      max_vehicle_type: "7.5t",
      max_length_m: 9,
      height_limit_m: 3.8,
      induction_required: true,
      ppe_required: true,
      contact_must_be_present: true,
      crane_drop_allowed: true,
    },
  ]);
  await insert(client, "contacts", [
    {
      customer_id: hillside,
      name: "Gemma Hill",
      job_role: "Office manager",
      phone: "01453 000123",
      email: "gemma@hillside.example",
    },
    {
      customer_id: marlow,
      site_id: marlowSite,
      name: "Tom Marlow",
      job_role: "Owner",
      phone: "07700 900321",
    },
    {
      customer_id: severn,
      name: "Goods-in",
      job_role: "Goods-in",
      phone: "01633 000456",
      email: "goodsin@severn-timber.example",
    },
    { customer_id: oakfield, name: "Priya Shah", job_role: "Site manager", phone: "07700 900654" },
  ]);
}

const isoInDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
};

/** A week of fictional orders across the seeded customers (spec 13). */
async function seedOrders(client: Client) {
  const [{ data: sites }, { data: units }] = await Promise.all([
    client.from("sites").select("id, customer_id, name, delivery_instructions"),
    client.from("unit_types").select("id, short_code, typical_weight_kg"),
  ]);
  const site = (name: string) => sites!.find((s) => s.name === name)!;
  const unit = (code: string) => units!.find((u) => u.short_code === code)!;
  const line = (code: string, quantity: number, description = "") => ({
    unit_type_id: unit(code).id,
    quantity,
    weight_per_unit_kg: Number(unit(code).typical_weight_kg),
    description,
  });
  const order = (
    siteName: string,
    fields: Record<string, unknown>,
    lines: ReturnType<typeof line>[],
  ) => {
    const s = site(siteName);
    return {
      order: {
        customer_id: s.customer_id,
        site_id: s.id,
        delivery_instructions: s.delivery_instructions,
        ...fields,
      },
      lines,
    };
  };
  const orders = [
    order(
      "Stroud yard",
      {
        order_ref: "SO-24101",
        customer_po: "HB-PO-7781",
        delivery_note_number: "DN-50211",
        invoice_number: "INV-90311",
        required_date: isoInDays(1),
        readiness: "ready",
      },
      [line("DP", 6, "Oak internal doors, 762 × 1981"), line("LL", 4, "Architrave packs")],
    ),
    order(
      "Gloucester workshop",
      {
        order_ref: "SO-24102",
        customer_po: "MJ-3310",
        required_date: isoInDays(1),
        readiness: "part_ready",
        missing_items: "2 door frames",
        expected_ready_date: isoInDays(1),
        urgency: "timed",
      },
      [line("DP", 3, "Fire doors FD30")],
    ),
    order(
      "Newport depot",
      {
        order_ref: "SO-24103",
        customer_po: "STM-PO-0412",
        delivery_note_number: "DN-50212",
        required_date: isoInDays(2),
        readiness: "in_production",
        expected_ready_date: isoInDays(1),
      },
      [line("EUR", 4, "Door furniture"), line("UKP", 2)],
    ),
    order(
      "Plot 14, Meadow View",
      {
        order_ref: "SO-24104",
        customer_po: "OAK-14-221",
        required_date: isoInDays(3),
        readiness: "not_started",
        urgency: "critical",
        notes: "Site manager must sign.",
      },
      [line("DP", 8, "Plot 14 door set")],
    ),
    order(
      "Stroud yard",
      {
        order_ref: "SO-24105",
        required_date: isoInDays(4),
        earliest_date: isoInDays(2),
        readiness: "ready",
      },
      [line("UKP", 3)],
    ),
  ];
  const { error } = await client.rpc("import_orders", { orders });
  if (error) throw new Error(`orders: ${error.message}`);
}

/** The next working day on or after `daysAhead` days from today (London). */
export function workingDay(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const iso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
  const weekday = () =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(d);
  while (["Sat", "Sun"].includes(weekday())) d.setTime(d.getTime() + 86_400_000);
  return iso();
}

/** The first three working days from today: d0 (today, or Monday at a weekend), d1, d2. */
export function planningDays() {
  const d0 = workingDay(0);
  const after = (iso: string) => {
    let n = 1;
    while (workingDay(n) <= iso) n += 1;
    return workingDay(n);
  };
  const d1 = after(d0);
  return { d0, d1, d2: after(d1) };
}

/**
 * Loads for the first three working days that, between them, show every
 * warning in spec 7.2 (returnable assets arrive in Stage 9). Orders are PL-3xx.
 */
async function seedPlanning(client: Client) {
  const { d0, d1, d2 } = planningDays();
  const [
    { data: units },
    { data: vehicles },
    { data: hauliers },
    { data: drivers },
    { data: depots },
  ] = await Promise.all([
    client.from("unit_types").select("id, short_code"),
    client.from("vehicles").select("id, name"),
    client.from("hauliers").select("id, name"),
    client.from("drivers").select("id, name"),
    client.from("depots").select("id").eq("is_default", true),
  ]);
  const unit = (code: string) => units!.find((u) => u.short_code === code)!.id;
  const vehicle = (name: string) => vehicles!.find((v) => v.name === name)!.id;
  const driver = (name: string) => drivers!.find((d) => d.name === name)!.id;

  // A customer far enough away to run into driving hours and a clean air zone.
  const [tyneside] = await insert(client, "customers", [
    { name: "Tyneside Joinery", account_ref: "TYN05" },
  ]);
  await insert(client, "sites", [
    {
      customer_id: tyneside,
      name: "Gateshead works",
      postcode: "NE8 3AA",
      latitude: 54.95702,
      longitude: -1.60338,
      location_source: "postcode",
      site_equipment: ["forklift"],
      opening_hours: Object.fromEntries(
        ["mon", "tue", "wed", "thu", "fri"].map((d) => [d, { open: "06:00", close: "18:00" }]),
      ),
      last_verified_at: new Date().toISOString(),
    },
  ]);
  const { data: sites } = await client.from("sites").select("id, customer_id, name");
  const site = (name: string) => sites!.find((s) => s.name === name)!;

  const order = (
    ref: string,
    siteName: string,
    lines: [string, number, number][],
    fields: Record<string, unknown> = {},
  ) => ({
    order: {
      customer_id: site(siteName).customer_id,
      site_id: site(siteName).id,
      order_ref: ref,
      required_date: d1,
      readiness: "ready",
      ...fields,
    },
    lines: lines.map(([code, quantity, weight]) => ({
      unit_type_id: unit(code),
      quantity,
      weight_per_unit_kg: weight,
    })),
  });
  const orders = [
    order("PL-301", "Gloucester workshop", [["DP", 3, 140]], {
      readiness: "part_ready",
      missing_items: "1 door frame",
      expected_ready_date: d0,
    }),
    order("PL-302", "Plot 14, Meadow View", [["DP", 2, 140]]),
    order("PL-303", "Stroud yard", [["UKP", 14, 400]], { required_date: d0 }),
    order("PL-304", "Plot 14, Meadow View", [["EUR", 4, 300]], {
      required_date: d2,
      readiness: "not_started",
    }),
    order("PL-305", "Newport depot", [["EUR", 2, 300]], { required_date: d0 }),
    order("PL-306", "Gateshead works", [["EUR", 4, 300]], { required_date: d2 }),
    order("PL-307", "Gloucester workshop", [["UKP", 1, 800]], { required_date: d2 }),
    order("PL-308", "Stroud yard", [["EUR", 6, 300]], { required_date: d0 }),
  ];
  const { error } = await client.rpc("import_orders", { orders });
  if (error) throw new Error(`planning orders: ${error.message}`);
  const { data: saved } = await client
    .from("orders")
    .select("id, order_ref")
    .like("order_ref", "PL-3%");
  const orderId = (ref: string) => saved!.find((o) => o.order_ref === ref)!.id;

  async function load(row: Record<string, unknown>, refs: string[], driverNames: string[] = []) {
    const [id] = await insert(client, "loads", [{ depot_id: depots![0].id, ...row }]);
    for (const ref of refs) {
      const { error: addError } = await client.rpc("add_order_to_load", {
        target_load: id,
        target_order: orderId(ref),
      });
      if (addError) throw new Error(`add ${ref}: ${addError.message}`);
    }
    if (driverNames.length) {
      await insert(
        client,
        "load_drivers",
        driverNames.map((n) => ({ load_id: id, driver_id: driver(n) })),
      );
    }
    return id;
  }
  const stopFor = async (loadId: string) =>
    (await client.from("load_stops").select("id, sequence").eq("load_id", loadId).order("sequence"))
      .data!;

  // d0: a clean, confirmed run, and a pallet network drop with no booking yet.
  const clean = await load(
    { load_date: d0, vehicle_id: vehicle("18t curtainsider"), crew_size: 2 },
    ["PL-308"],
    ["Dave Hughes"],
  );
  await client
    .from("load_stops")
    .update({ confirmed: true, confirmed_by: "Gemma Hill", confirmation_method: "phone" })
    .eq("load_id", clean);
  await client.from("loads").update({ status: "confirmed" }).eq("id", clean);
  const network = await load(
    { load_date: d0, haulier_id: hauliers!.find((h) => h.name === "Severn Pallet Network")!.id },
    ["PL-305"],
  );
  await client.from("load_stops").update({ eta_from: "17:15" }).eq("load_id", network);

  // d1: doors to tight sites on the Luton, and too much on the 7.5t.
  await load(
    { load_date: d1, vehicle_id: vehicle("Luton 1"), crew_size: 1 },
    ["PL-301", "PL-302"],
    ["Gareth Morgan"],
  );
  const heavy = await load(
    { load_date: d1, vehicle_id: vehicle("7.5t curtainsider"), crew_size: 1 },
    ["PL-303"],
    ["Dave Hughes"],
  );
  for (const s of await stopFor(heavy)) {
    await client
      .from("load_stops")
      .update({ confirmed: true, confirmed_by: "Gemma Hill", confirmation_method: "email" })
      .eq("id", s.id);
  }

  // d2: an 18t that can't get into Plot 14, a long run to Gateshead, and a heavy pallet for the tail lift.
  await load(
    { load_date: d2, vehicle_id: vehicle("18t curtainsider"), crew_size: 2 },
    ["PL-304"],
    ["Dave Hughes"],
  );
  await load(
    { load_date: d2, vehicle_id: vehicle("7.5t curtainsider"), crew_size: 1 },
    ["PL-306"],
    ["Gareth Morgan"],
  );
  await load({ load_date: d2, vehicle_id: vehicle("Luton 1"), crew_size: 1 }, ["PL-307"]);
}

/**
 * Today's run for the "Dan Driver" login (spec 9.8): a confirmed Luton with
 * three drops. Orders are DR-4xx. Today may be a weekend; drivers work then too.
 */
async function seedDriverRun(client: Client) {
  const today = isoInDays(0);
  const [
    { data: members },
    { data: units },
    { data: vehicles },
    { data: depots },
    { data: sites },
  ] = await Promise.all([
    client.from("memberships").select("user_id, profile:profiles(full_name)").eq("role", "driver"),
    client.from("unit_types").select("id, short_code"),
    client.from("vehicles").select("id, name"),
    client.from("depots").select("id").eq("is_default", true),
    client.from("sites").select("id, customer_id, name"),
  ]);
  const login = (members ?? []).find(
    (m) => (m.profile as unknown as { full_name: string } | null)?.full_name === "Dan Driver",
  );
  if (!login) return;
  const unit = (code: string) => units!.find((u) => u.short_code === code)!.id;
  const site = (name: string) => sites!.find((x) => x.name === name)!;
  const [driverId] = await insert(client, "drivers", [
    {
      name: "Dan Driver",
      phone: "07700 900777",
      licence_categories: ["B", "C1"],
      available_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      user_id: login.user_id,
    },
  ]);
  const order = (ref: string, siteName: string, lines: [string, number, number][], extra = {}) => ({
    order: {
      customer_id: site(siteName).customer_id,
      site_id: site(siteName).id,
      order_ref: ref,
      customer_po: `PO-${ref.slice(3)}`,
      required_date: today,
      readiness: "ready",
      ...extra,
    },
    lines: lines.map(([code, quantity, weight]) => ({
      unit_type_id: unit(code),
      quantity,
      weight_per_unit_kg: weight,
    })),
  });
  const { error } = await client.rpc("import_orders", {
    orders: [
      order("DR-401", "Stroud yard", [["DP", 2, 140]], {
        delivery_instructions: "Use the side gate; goods-in is behind the timber store.",
      }),
      order("DR-402", "Gloucester workshop", [
        ["DP", 3, 140],
        ["EUR", 1, 200],
      ]),
      order("DR-403", "Plot 14, Meadow View", [["DP", 2, 140]]),
    ],
  });
  if (error) throw new Error(`driver run orders: ${error.message}`);
  const { data: saved } = await client
    .from("orders")
    .select("id, order_ref")
    .like("order_ref", "DR-4%")
    .order("order_ref");
  const [loadId] = await insert(client, "loads", [
    {
      load_date: today,
      depot_id: depots![0].id,
      vehicle_id: vehicles!.find((v) => v.name === "Luton 1")!.id,
      start_time: "07:00",
    },
  ]);
  for (const o of saved!) {
    const { error: addError } = await client.rpc("add_order_to_load", {
      target_load: loadId,
      target_order: o.id,
    });
    if (addError) throw new Error(`add ${o.order_ref}: ${addError.message}`);
  }
  await insert(client, "load_drivers", [{ load_id: loadId, driver_id: driverId }]);
  const { data: stops } = await client
    .from("load_stops")
    .select("id, sequence")
    .eq("load_id", loadId)
    .order("sequence");
  await client
    .from("load_stops")
    .update({ booking_slot: "10:30", booking_ref: "GL-2231" })
    .eq("id", stops![1].id);
  await client.from("loads").update({ status: "confirmed" }).eq("id", loadId);
}

/** The 10th of last month and of the month before, for history searches. */
export function historyDates() {
  const [y, m] = isoInDays(0).split("-").map(Number);
  const tenth = (back: number) => {
    const d = new Date(Date.UTC(y, m - 1 - back, 10));
    return d.toISOString().slice(0, 10);
  };
  return { lastMonth: tenth(1), monthBefore: tenth(2) };
}

/**
 * Past deliveries (orders HS-5xx), for "what did we send Hillside Builders in
 * [last month]?": one load last month to Hillside and Marlow, and an older one.
 */
async function seedHistory(client: Client) {
  const { lastMonth, monthBefore } = historyDates();
  const [
    { data: units },
    { data: vehicles },
    { data: depots },
    { data: sites },
    { data: drivers },
  ] = await Promise.all([
    client.from("unit_types").select("id, short_code"),
    client.from("vehicles").select("id, name"),
    client.from("depots").select("id").eq("is_default", true),
    client.from("sites").select("id, customer_id, name"),
    client.from("drivers").select("id, name"),
  ]);
  const unit = (code: string) => units!.find((u) => u.short_code === code)!.id;
  const site = (name: string) => sites!.find((x) => x.name === name)!;
  const order = (
    ref: string,
    siteName: string,
    date: string,
    lines: [string, number][],
    po: string,
  ) => ({
    order: {
      customer_id: site(siteName).customer_id,
      site_id: site(siteName).id,
      order_ref: ref,
      customer_po: po,
      delivery_note_number: `DN-${ref.slice(3)}`,
      required_date: date,
      readiness: "ready",
    },
    lines: lines.map(([code, quantity]) => ({
      unit_type_id: unit(code),
      quantity,
      weight_per_unit_kg: 140,
    })),
  });
  const { error } = await client.rpc("import_orders", {
    orders: [
      order(
        "HS-501",
        "Stroud yard",
        lastMonth,
        [
          ["DP", 4],
          ["EUR", 2],
        ],
        "HB-7781",
      ),
      order("HS-502", "Gloucester workshop", lastMonth, [["DP", 3]], "MJ-3302"),
      order("HS-503", "Stroud yard", monthBefore, [["DP", 6]], "HB-7650"),
    ],
  });
  if (error) throw new Error(`history orders: ${error.message}`);
  const { data: saved } = await client
    .from("orders")
    .select("id, order_ref")
    .like("order_ref", "HS-5%");
  const id = (ref: string) => saved!.find((o) => o.order_ref === ref)!.id;

  async function pastLoad(date: string, refs: string[]) {
    const [loadId] = await insert(client, "loads", [
      {
        load_date: date,
        depot_id: depots![0].id,
        vehicle_id: vehicles!.find((v) => v.name === "18t curtainsider")!.id,
      },
    ]);
    for (const ref of refs) {
      const { error: addError } = await client.rpc("add_order_to_load", {
        target_load: loadId,
        target_order: id(ref),
      });
      if (addError) throw new Error(`add ${ref}: ${addError.message}`);
    }
    await insert(client, "load_drivers", [
      { load_id: loadId, driver_id: drivers!.find((d) => d.name === "Dave Hughes")!.id },
    ]);
    await client
      .from("load_stops")
      .update({
        status: "delivered",
        confirmed: true,
        confirmed_by: "Gemma Hill",
        confirmation_method: "phone",
      })
      .eq("load_id", loadId);
    await client.from("loads").update({ status: "complete" }).eq("id", loadId);
    await client.from("orders").update({ status: "delivered" }).in("id", refs.map(id));
  }
  await pastLoad(lastMonth, ["HS-501", "HS-502"]);
  await pastLoad(monthBefore, ["HS-503"]);
}

/**
 * Returnable stillages (spec 6.11): six at the depot (ST-101…106), and two
 * overdue at a customer site that no seeded load visits, so they only show up
 * where a test puts them.
 */
async function seedAssets(client: Client) {
  const [{ data: depots }] = await Promise.all([
    client.from("depots").select("id").eq("is_default", true),
  ]);
  const [stillage] = await insert(client, "unit_types", [
    {
      name: "Stillage",
      short_code: "STL",
      colour_tag: "load-6",
      length_mm: 1200,
      width_mm: 1000,
      height_mm: 1500,
      typical_weight_kg: 60,
      returnable: true,
      return_days: 28,
    },
  ]);
  const [kitchens] = await insert(client, "customers", [
    { name: "Cotswold Kitchens", account_ref: "CK09" },
  ]);
  const [showroom] = await insert(client, "sites", [
    {
      customer_id: kitchens,
      name: "Cheltenham showroom",
      postcode: "GL50 1HX",
      latitude: 51.89965,
      longitude: -2.07846,
      location_source: "postcode",
      site_equipment: ["forklift"],
      last_verified_at: new Date().toISOString(),
    },
  ]);
  await insert(
    client,
    "assets",
    ["ST-101", "ST-102", "ST-103", "ST-104", "ST-105", "ST-106"].map((n) => ({
      unit_type_id: stillage,
      asset_number: n,
      depot_id: depots![0].id,
    })),
  );
  await insert(
    client,
    "assets",
    ["ST-201", "ST-202"].map((n) => ({
      unit_type_id: stillage,
      asset_number: n,
      status: "at_customer",
      customer_id: kitchens,
      site_id: showroom,
      dropped_on: isoInDays(-40),
      expected_return_date: isoInDays(-12),
    })),
  );
}

/**
 * Completed haulier loads last month for the reports (HS-504…506): Cotswold
 * Haulage at an agreed £180 for two drops, one of which failed (no access),
 * and Severn Pallet Network priced from its rate card, failed (site closed).
 */
async function seedReports(client: Client) {
  const { lastMonth } = historyDates();
  const day = lastMonth.replace(/-10$/, "-11");
  const [{ data: units }, { data: hauliers }, { data: depots }, { data: sites }] =
    await Promise.all([
      client.from("unit_types").select("id, short_code"),
      client.from("hauliers").select("id, name"),
      client.from("depots").select("id").eq("is_default", true),
      client.from("sites").select("id, customer_id, name"),
    ]);
  const unit = (code: string) => units!.find((u) => u.short_code === code)!.id;
  const site = (name: string) => sites!.find((x) => x.name === name)!;
  const haulier = (name: string) => hauliers!.find((h) => h.name === name)!.id;
  const order = (ref: string, siteName: string, code: string, quantity: number) => ({
    order: {
      customer_id: site(siteName).customer_id,
      site_id: site(siteName).id,
      order_ref: ref,
      required_date: day,
      readiness: "ready",
    },
    lines: [{ unit_type_id: unit(code), quantity, weight_per_unit_kg: 300 }],
  });
  const { error } = await client.rpc("import_orders", {
    orders: [
      order("HS-504", "Plot 14, Meadow View", "EUR", 2),
      order("HS-505", "Gloucester workshop", "EUR", 1),
      order("HS-506", "Newport depot", "EUR", 2),
    ],
  });
  if (error) throw new Error(`report orders: ${error.message}`);
  const { data: saved } = await client
    .from("orders")
    .select("id, order_ref")
    .like("order_ref", "HS-50%");
  const id = (ref: string) => saved!.find((o) => o.order_ref === ref)!.id;

  async function haulierLoad(
    name: string,
    agreed: number | null,
    drops: { ref: string; failed?: string }[],
  ) {
    const [loadId] = await insert(client, "loads", [
      { load_date: day, depot_id: depots![0].id, haulier_id: haulier(name), agreed_price: agreed },
    ]);
    for (const d of drops) {
      const { data: stopId, error: addError } = await client.rpc("add_order_to_load", {
        target_load: loadId,
        target_order: id(d.ref),
      });
      if (addError) throw new Error(`add ${d.ref}: ${addError.message}`);
      await client
        .from("load_stops")
        .update({ status: d.failed ? "failed" : "delivered" })
        .eq("id", stopId);
      if (d.failed) {
        await insert(client, "pods", [
          {
            stop_id: stopId,
            load_id: loadId,
            client_id: randomUUID(),
            outcome: "failed",
            failure_reason: d.failed,
            note: "Recorded for the reports demo",
            recorded_at: `${day}T11:00:00Z`,
          },
        ]);
      }
      await client
        .from("orders")
        .update({ status: d.failed ? "failed" : "delivered" })
        .eq("id", id(d.ref));
    }
    await client.from("loads").update({ status: "complete" }).eq("id", loadId);
  }
  await haulierLoad("Cotswold Haulage", 180, [
    { ref: "HS-504" },
    { ref: "HS-505", failed: "no_access" },
  ]);
  await haulierLoad("Severn Pallet Network", null, [{ ref: "HS-506", failed: "site_closed" }]);
}
