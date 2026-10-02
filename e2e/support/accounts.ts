import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../../tests/support/local-supabase";

/** Test accounts are created through the admin API so tests don't depend on each other. */

export const PASSWORD = "correct-horse-battery";
const env = localSupabase();
const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const service = createClient(env.apiUrl, env.secretKey, options);

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
    created[m.role] = user.email;
  }
  await seedSettings(admin.client);
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
      unload_methods: ["tail_lift", "rear"],
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
      caz_compliant: true,
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
  const [pallets] = await insert(client, "hauliers", [
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
