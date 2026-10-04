import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  anonymous,
  createOrg,
  createUser,
  member,
  service,
  type TestOrg,
  type TestUser,
} from "./helpers";
import {
  CUSTOMER_TABLES,
  ORDER_TABLES,
  PLANNING_TABLES,
  SETTINGS_TABLES,
  createCustomer,
  createOrder,
  createLoad,
  createAssets,
  createPod,
  createStandingRun,
  createSettings,
  uploadPodFile,
  type CustomerFixture,
  type LoadFixture,
  type PodFixture,
  type AssetFixture,
  type OrderFixture,
  type SettingsFixture,
} from "./fixtures";

/**
 * Spec section 5 and Stage 1 "Done when": a user from Organisation A cannot
 * read, list, update or delete anything belonging to Organisation B, through
 * any route (tables, functions, storage), and neither can anyone signed out.
 */

let orgA: TestOrg;
let orgB: TestOrg;
let outsider: TestUser;
let inviteA: { id: string; token: string };
let settingsA: SettingsFixture;
let settingsB: SettingsFixture;
let customerA: CustomerFixture;
let customerB: CustomerFixture;
let orderA: OrderFixture;
let orderB: OrderFixture;
let loadA: LoadFixture;
let loadB: LoadFixture;
let podA: PodFixture;
let assetsA: AssetFixture;
let runA: string;
const fileA = () => `${orgA.id}/documents/delivery-note.txt`;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([
    createOrg("alpha", ["planner", "office", "warehouse", "driver"]),
    createOrg("bravo", ["planner"]),
  ]);
  outsider = await createUser("outsider");
  [settingsA, settingsB] = await Promise.all([
    createSettings(orgA.admin.client, "alpha", member(orgA, "driver").id),
    createSettings(orgB.admin.client, "bravo"),
  ]);
  [customerA, customerB] = await Promise.all([
    createCustomer(orgA.admin.client, "alpha"),
    createCustomer(orgB.admin.client, "bravo"),
  ]);
  orderA = await createOrder(orgA.admin.client, "alpha", settingsA, customerA);
  orderB = await createOrder(orgB.admin.client, "bravo", settingsB, customerB);
  [loadA, loadB] = await Promise.all([
    createLoad(orgA.admin.client, settingsA, orderA),
    createLoad(orgB.admin.client, settingsB, orderB),
  ]);
  podA = await createPod(orgA.admin.client, "alpha", settingsA, customerA);
  assetsA = await createAssets(orgA.admin.client, "alpha", settingsA, customerA, loadA);
  await createAssets(orgB.admin.client, "bravo", settingsB, customerB, loadB);
  runA = await createStandingRun(orgA.admin.client, "alpha", settingsA, customerA);

  const { data, error } = await orgA.admin.client
    .rpc("create_invitation", { invite_email: "pending@example.test", invite_role: "office" })
    .single<{ invitation_id: string; token: string }>();
  if (error) throw error;
  inviteA = { id: data.invitation_id, token: data.token };

  const upload = await orgA.admin.client.storage
    .from("organisation-files")
    .upload(fileA(), new Blob(["Delivery note for Alpha"]), { contentType: "text/plain" });
  if (upload.error) throw upload.error;
}, 60_000);

/** Every table holding organisation data, and the column naming the organisation. */
const TABLES: { table: string; orgColumn: string; patch: Record<string, unknown> }[] = [
  { table: "organisations", orgColumn: "id", patch: { name: "Hijacked" } },
  { table: "memberships", orgColumn: "organisation_id", patch: { role: "admin" } },
  { table: "invitations", orgColumn: "organisation_id", patch: { email: "x@example.test" } },
  { table: "audit_log", orgColumn: "organisation_id", patch: { action: "delete" } },
  ...SETTINGS_TABLES.map((t) => ({ ...t, orgColumn: "organisation_id" })),
  ...CUSTOMER_TABLES.map((t) => ({ ...t, orgColumn: "organisation_id" })),
  ...ORDER_TABLES.map((t) => ({ ...t, orgColumn: "organisation_id" })),
  ...PLANNING_TABLES.map((t) => ({ ...t, orgColumn: "organisation_id" })),
];

/** Clients that must never see Organisation A's data. */
function intruders(): [string, SupabaseClient][] {
  return [
    ["Organisation B admin", orgB.admin.client],
    ["Organisation B planner", member(orgB, "planner").client],
    ["signed-in user with no organisation", outsider.client],
    ["signed-out visitor", anonymous()],
  ];
}

/** Every row of A's data in a table, as stored, to prove nothing changed. */
async function snapshot(table: string, column: string) {
  const { data, error } = await service.from(table).select("*").eq(column, orgA.id).order("id");
  if (error) throw error;
  return data;
}

async function countFor(table: string, column: string, orgId: string) {
  const { count, error } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, orgId);
  if (error) throw error;
  return count ?? 0;
}

describe("Organisation A's data is invisible to everyone outside it", () => {
  it("has data to protect", async () => {
    for (const { table, orgColumn } of TABLES) {
      expect(await countFor(table, orgColumn, orgA.id), table).toBeGreaterThan(0);
    }
  });

  for (const { table, orgColumn, patch } of TABLES) {
    describe(table, () => {
      it("cannot be read or listed", async () => {
        for (const [who, client] of intruders()) {
          const filtered = await client.from(table).select("*").eq(orgColumn, orgA.id);
          expect(filtered.data ?? [], `${who}: filtered`).toEqual([]);
          const all = await client.from(table).select(orgColumn);
          const leaked = (all.data ?? []).filter(
            (r) => (r as unknown as Record<string, string>)[orgColumn] === orgA.id,
          );
          expect(leaked, `${who}: listing`).toEqual([]);
        }
      });

      it("cannot be updated", async () => {
        const before = await snapshot(table, orgColumn);
        for (const [who, client] of intruders()) {
          const { data } = await client.from(table).update(patch).eq(orgColumn, orgA.id).select();
          expect(data ?? [], who).toEqual([]);
        }
        expect(await snapshot(table, orgColumn)).toEqual(before);
      });

      it("cannot be deleted", async () => {
        const before = await countFor(table, orgColumn, orgA.id);
        for (const [, client] of intruders()) {
          await client.from(table).delete().eq(orgColumn, orgA.id);
        }
        expect(await countFor(table, orgColumn, orgA.id)).toBe(before);
      });
    });
  }

  it("rows cannot be inserted into Organisation A", async () => {
    for (const [who, client] of intruders()) {
      const attempts = [
        client
          .from("memberships")
          .insert({ organisation_id: orgA.id, user_id: outsider.id, role: "admin" }),
        client.from("invitations").insert({
          organisation_id: orgA.id,
          email: "x@example.test",
          role: "admin",
          token_hash: "x",
        }),
        client
          .from("audit_log")
          .insert({ organisation_id: orgA.id, table_name: "memberships", action: "insert" }),
        client.from("organisations").insert({ id: orgA.id, name: "Duplicate" }),
      ];
      for (const result of await Promise.all(attempts)) {
        expect(result.error, who).not.toBeNull();
      }
    }
    expect(await countFor("memberships", "organisation_id", orgA.id)).toBe(5);
  });

  it("settings rows cannot be added to Organisation A", async () => {
    const before = await countFor("depots", "organisation_id", orgA.id);
    for (const [who, client] of intruders()) {
      const { error } = await client
        .from("depots")
        .insert({ organisation_id: orgA.id, name: `Planted by ${who}`, postcode: "GL5 3AA" });
      expect(error, who).not.toBeNull();
    }
    expect(await countFor("depots", "organisation_id", orgA.id)).toBe(before);
  });

  it("member profiles (personal data) stay private", async () => {
    const plannerA = member(orgA, "planner");
    for (const [who, client] of intruders()) {
      const { data } = await client
        .from("profiles")
        .select("*")
        .in("id", [orgA.admin.id, plannerA.id]);
      expect(data ?? [], who).toEqual([]);
      const { data: updated } = await client
        .from("profiles")
        .update({ full_name: "Changed" })
        .eq("id", plannerA.id)
        .select();
      expect(updated ?? [], who).toEqual([]);
    }
    const { data } = await service
      .from("profiles")
      .select("full_name")
      .eq("id", plannerA.id)
      .single();
    expect(data?.full_name).toBe("Test alpha-planner");
  });
});

describe("functions cannot reach across organisations", () => {
  it("another organisation's admin cannot cancel A's invitation", async () => {
    const { error } = await orgB.admin.client.rpc("revoke_invitation", {
      target_invitation_id: inviteA.id,
    });
    expect(error).not.toBeNull();
    const { data } = await service
      .from("invitations")
      .select("revoked_at")
      .eq("id", inviteA.id)
      .single();
    expect(data?.revoked_at).toBeNull();
  });

  it("a member of another organisation cannot join A with A's invitation link", async () => {
    const { error } = await orgB.admin.client.rpc("accept_invitation", {
      invite_token: inviteA.token,
    });
    expect(error?.message).toMatch(/different email|already belong/);
  });

  it("someone with the link but a different email cannot use it", async () => {
    const { error } = await outsider.client.rpc("accept_invitation", {
      invite_token: inviteA.token,
    });
    expect(error?.message).toMatch(/different email/);
    const { data } = await service.from("memberships").select("id").eq("user_id", outsider.id);
    expect(data).toEqual([]);
  });

  it("guessing a token reveals nothing", async () => {
    const { data } = await anonymous().rpc("get_invitation", { invite_token: "0".repeat(64) });
    expect(data).toEqual([]);
  });

  it("the invitation link only reveals the organisation name, email and role", async () => {
    const { data } = await anonymous().rpc("get_invitation", { invite_token: inviteA.token });
    expect(data).toEqual([
      {
        organisation_name: "alpha Ltd",
        email: "pending@example.test",
        role: "office",
        status: "open",
      },
    ]);
  });

  it("invitations created by B's admin land in B, not A", async () => {
    const { data } = await orgB.admin.client
      .rpc("create_invitation", { invite_email: "newstarter@example.test", invite_role: "planner" })
      .single<{ invitation_id: string }>();
    const { data: row } = await service
      .from("invitations")
      .select("organisation_id")
      .eq("id", data!.invitation_id)
      .single();
    expect(row?.organisation_id).toBe(orgB.id);
  });

  it("signed-out visitors cannot call account functions", async () => {
    const anon = anonymous();
    expect(
      (await anon.rpc("create_organisation", { organisation_name: "Sneaky" })).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("create_invitation", {
          invite_email: "a@example.test",
          invite_role: "admin",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await anon.rpc("revoke_invitation", { target_invitation_id: inviteA.id })).error,
    ).not.toBeNull();
    expect(
      (await anon.rpc("accept_invitation", { invite_token: inviteA.token })).error,
    ).not.toBeNull();
  });

  it("internal helper functions are not callable through the API", async () => {
    for (const fn of ["current_org_id", "my_role", "has_role", "audit", "handle_new_user"]) {
      const { error } = await orgA.admin.client.rpc(fn);
      expect(error, fn).not.toBeNull();
    }
  });
});

describe("storage is split by organisation folder", () => {
  const bucket = "organisation-files";

  it("A's members can read A's files", async () => {
    const { data, error } = await member(orgA, "office")
      .client.storage.from(bucket)
      .download(fileA());
    expect(error).toBeNull();
    expect(await data!.text()).toBe("Delivery note for Alpha");
  });

  it("outsiders cannot download, list, overwrite or delete A's files", async () => {
    for (const [who, client] of intruders()) {
      const storage = client.storage.from(bucket);
      expect((await storage.download(fileA())).error, `${who}: download`).not.toBeNull();
      const listed = await storage.list(`${orgA.id}/documents`);
      expect(listed.data ?? [], `${who}: list`).toEqual([]);
      const overwrite = await storage.upload(fileA(), new Blob(["tampered"]), { upsert: true });
      expect(overwrite.error, `${who}: overwrite`).not.toBeNull();
      await storage.remove([fileA()]);
    }
    const { data } = await service.storage.from(bucket).download(fileA());
    expect(await data!.text()).toBe("Delivery note for Alpha");
  });

  it("nobody can upload into another organisation's folder", async () => {
    const { error } = await orgB.admin.client.storage
      .from(bucket)
      .upload(`${orgA.id}/planted.txt`, new Blob(["planted"]));
    expect(error).not.toBeNull();
  });

  it("files outside any organisation folder are refused", async () => {
    const { error } = await orgA.admin.client.storage
      .from(bucket)
      .upload("loose.txt", new Blob(["x"]));
    expect(error).not.toBeNull();
  });
});

describe("rows can never point at another organisation's data", () => {
  // Organisation B's admin may write to B, but must not be able to link B's rows to A's.
  const b = () => orgB.admin.client;

  it("a capacity can't be added for A's vehicle or A's unit type", async () => {
    const onAVehicle = await b().from("vehicle_capacities").insert({
      vehicle_id: settingsA.vehicleId,
      unit_type_id: settingsB.unitTypeId,
      max_units: 1,
    });
    expect(onAVehicle.error).not.toBeNull();
    const withAUnit = await b().from("vehicle_capacities").insert({
      vehicle_id: settingsB.vehicleId,
      unit_type_id: settingsA.unitTypeId,
      max_units: 1,
    });
    expect(withAUnit.error).not.toBeNull();
  });

  it("a rate card can't be attached to A's haulier, or priced for A's zones", async () => {
    const card = await b()
      .from("rate_cards")
      .insert({ haulier_id: settingsA.haulierId, name: "Sneaky", valid_from: "2026-01-01" });
    expect(card.error).not.toBeNull();
    const price = await b().from("rate_card_pallet_prices").insert({
      rate_card_id: settingsB.rateCardId,
      zone_id: settingsA.zoneId,
      pallet_size: "half",
      price: 1,
    });
    expect(price.error).not.toBeNull();
  });

  it("a driver can't be linked to a user from A", async () => {
    const { error } = await b()
      .from("drivers")
      .insert({ name: "Borrowed driver", user_id: member(orgA, "driver").id });
    expect(error).not.toBeNull();
  });

  it("moving a row into A is ignored", async () => {
    await b().from("depots").update({ organisation_id: orgA.id }).eq("id", settingsB.depotId);
    const { data } = await service
      .from("depots")
      .select("organisation_id")
      .eq("id", settingsB.depotId)
      .single();
    expect(data?.organisation_id).toBe(orgB.id);
  });

  it("the save functions can't touch A's vehicle or rate card", async () => {
    const before = await snapshot("vehicle_capacities", "organisation_id");
    await b().rpc("save_vehicle_capacities", {
      target_vehicle_id: settingsA.vehicleId,
      capacities: [{ unit_type_id: settingsB.unitTypeId, max_units: 50 }],
    });
    expect(await snapshot("vehicle_capacities", "organisation_id")).toEqual(before);

    const prices = await snapshot("rate_card_pallet_prices", "organisation_id");
    await b().rpc("save_rate_card_prices", {
      target_rate_card_id: settingsA.rateCardId,
      pallet_prices: [],
      load_prices: [],
    });
    expect(await snapshot("rate_card_pallet_prices", "organisation_id")).toEqual(prices);
  });
});

describe("customers, sites and contacts can't be linked across organisations", () => {
  const b = () => orgB.admin.client;

  it("a site can't be added under A's customer", async () => {
    const { error } = await b()
      .from("sites")
      .insert({ customer_id: customerA.customerId, name: "Planted", postcode: "GL1 1AA" });
    expect(error).not.toBeNull();
  });

  it("a contact can't be attached to A's customer or A's site", async () => {
    const toCustomer = await b()
      .from("contacts")
      .insert({ customer_id: customerA.customerId, name: "Spy" });
    expect(toCustomer.error).not.toBeNull();
    const toSite = await b()
      .from("contacts")
      .insert({ customer_id: customerB.customerId, site_id: customerA.siteId, name: "Spy" });
    expect(toSite.error).not.toBeNull();
  });

  it("A's site can't be marked as verified by B", async () => {
    const { error } = await b().rpc("verify_site", { target_site_id: customerA.siteId });
    expect(error).not.toBeNull();
    const { data } = await service
      .from("sites")
      .select("last_verified_at")
      .eq("id", customerA.siteId)
      .single();
    expect(data?.last_verified_at).toBeNull();
  });
});

describe("orders can't be linked across organisations", () => {
  const b = () => orgB.admin.client;
  const base = (over: Record<string, unknown>) => ({
    customer_id: customerB.customerId,
    site_id: customerB.siteId,
    order_ref: `X-${Math.random().toString(36).slice(2, 8)}`,
    required_date: "2026-10-12",
    ...over,
  });

  it("an order can't use A's customer or site, or a site from another customer", async () => {
    for (const order of [
      base({ customer_id: customerA.customerId, site_id: customerA.siteId }),
      base({ site_id: customerA.siteId }),
    ]) {
      const { error } = await b().rpc("save_order", {
        target_order_id: null,
        order_data: order,
        lines: [],
      });
      expect(error).not.toBeNull();
    }
  });

  it("an order line can't use A's unit type", async () => {
    const { error } = await b().rpc("save_order", {
      target_order_id: null,
      order_data: base({}),
      lines: [{ unit_type_id: settingsA.unitTypeId, quantity: 1, weight_per_unit_kg: 1 }],
    });
    expect(error).not.toBeNull();
  });

  it("B can't rewrite A's order through save_order or link it to a quote", async () => {
    const before = await snapshot("orders", "organisation_id");
    const { error } = await b().rpc("save_order", {
      target_order_id: orderA.orderId,
      order_data: base({}),
      lines: [],
    });
    expect(error).not.toBeNull();
    expect(await snapshot("orders", "organisation_id")).toEqual(before);

    const { data: quote } = await b()
      .from("quote_requests")
      .insert({ haulier_id: settingsB.haulierId })
      .select("id")
      .single();
    const link = await b()
      .from("quote_request_orders")
      .insert({ quote_request_id: quote!.id, order_id: orderA.orderId });
    expect(link.error).not.toBeNull();
  });

  it("A's order history isn't visible to B, even to B's office staff", async () => {
    const { data } = await b().from("audit_log").select("id").eq("record_id", orderA.orderId);
    expect(data).toEqual([]);
  });
});

describe("loads can't be linked across organisations", () => {
  const b = () => orgB.admin.client;

  it("a load can't use A's depot, vehicle or haulier", async () => {
    for (const row of [
      { depot_id: settingsA.depotId },
      { depot_id: settingsB.depotId, vehicle_id: settingsA.vehicleId },
      { depot_id: settingsB.depotId, haulier_id: settingsA.haulierId },
    ]) {
      const { error } = await b()
        .from("loads")
        .insert({ load_date: "2026-10-12", ...row });
      expect(error).not.toBeNull();
    }
  });

  it("B can't add A's driver, site or order to B's load", async () => {
    const driver = await b()
      .from("load_drivers")
      .insert({ load_id: loadB.loadId, driver_id: settingsA.driverId });
    expect(driver.error).not.toBeNull();
    const stop = await b()
      .from("load_stops")
      .insert({ load_id: loadB.loadId, site_id: customerA.siteId, sequence: 9 });
    expect(stop.error).not.toBeNull();
    const rpc = await b().rpc("add_order_to_load", {
      target_load: loadB.loadId,
      target_order: orderA.orderId,
    });
    expect(rpc.error).not.toBeNull();
    const link = await b()
      .from("stop_orders")
      .insert({ stop_id: loadB.stopId, order_id: orderA.orderId, site_id: customerA.siteId });
    expect(link.error).not.toBeNull();
  });

  it("B can't move, reorder or override on A's load", async () => {
    const before = await snapshot("load_stops", "organisation_id");
    const add = await b().rpc("add_order_to_load", {
      target_load: loadA.loadId,
      target_order: orderB.orderId,
    });
    expect(add.error).not.toBeNull();
    await b().rpc("reorder_stops", { target_load: loadA.loadId, stop_ids: [loadA.stopId] });
    await b().rpc("remove_order_from_load", { target_order: orderA.orderId });
    expect(await snapshot("load_stops", "organisation_id")).toEqual(before);
    const override = await b().from("warning_overrides").insert({
      load_id: loadA.loadId,
      warning_key: "X:load:1",
      code: "CAPACITY_SPACE",
      entity_type: "load",
      entity_id: loadA.loadId,
      kind: "dismiss",
    });
    expect(override.error).not.toBeNull();
  });
});

describe("pick sheets can't be ticked across organisations", () => {
  it("B can't tick A's lines, through the function or directly", async () => {
    const before = await snapshot("pick_lines", "organisation_id");
    const { data: lines } = await service
      .from("order_lines")
      .select("id")
      .eq("order_id", orderA.orderId);
    for (const l of lines ?? []) {
      const { error } = await orgB.admin.client.rpc("tick_line", {
        target_line: l.id,
        set_loaded: true,
      });
      expect(error).not.toBeNull();
    }
    const { data: stopOrderB } = await service
      .from("stop_orders")
      .select("id")
      .eq("order_id", orderB.orderId)
      .single();
    const insert = await orgB.admin.client.from("pick_lines").insert({
      stop_order_id: stopOrderB!.id,
      order_id: orderA.orderId,
      order_line_id: lines![0].id,
    });
    expect(insert.error).not.toBeNull();
    expect(await snapshot("pick_lines", "organisation_id")).toEqual(before);
  });
});

describe("proof of delivery can't be recorded or seen across organisations", () => {
  it("B can't record a POD on A's stop, even with a file in its own folder", async () => {
    const before = await snapshot("pods", "organisation_id");
    const signature = await uploadPodFile(orgB.admin.client, loadB.stopId, "signature.png");
    for (const client of [orgB.admin.client, member(orgB, "planner").client]) {
      const { error } = await client.rpc("record_pod", {
        client_id: crypto.randomUUID(),
        target_stop: podA.stopId,
        outcome: "failed",
        failure_reason: "refused",
        note: "Hijacked",
        signature_path: signature,
      });
      expect(error).not.toBeNull();
    }
    expect(await snapshot("pods", "organisation_id")).toEqual(before);
  });

  it("B can't replay A's submission or put A's order back to plan", async () => {
    const { data: pod } = await service
      .from("pods")
      .select("client_id")
      .eq("id", podA.podId)
      .single();
    const replay = await orgB.admin.client.rpc("record_pod", {
      client_id: pod!.client_id,
      target_stop: loadB.stopId,
      outcome: "failed",
      failure_reason: "refused",
      note: "Replayed",
    });
    // Not handed A's POD id.
    expect(replay.data).not.toBe(podA.podId);
    const replan = await orgB.admin.client.rpc("replan_failed_order", {
      target_order: podA.orderId,
    });
    expect(replan.error).not.toBeNull();
  });
});

describe("assets can't be moved or planned across organisations", () => {
  it("B can't put A's assets on its loads or collect them", async () => {
    const before = await snapshot("assets", "organisation_id");
    const drop = await orgB.admin.client
      .from("stop_assets")
      .insert({ stop_id: loadB.stopId, asset_id: assetsA.atDepot, direction: "drop" });
    expect(drop.error).not.toBeNull();
    const collect = await orgB.admin.client.rpc("add_collection", {
      target_load: loadB.loadId,
      asset_ids: [assetsA.atCustomer],
    });
    expect(collect.error).not.toBeNull();
    const intoA = await orgB.admin.client.rpc("add_collection", {
      target_load: loadA.loadId,
      asset_ids: [assetsA.atCustomer],
    });
    expect(intoA.error).not.toBeNull();
    expect(await snapshot("assets", "organisation_id")).toEqual(before);
  });
});

describe("standing runs stay in their organisation", () => {
  it("B can't save over A's run or generate loads from it", async () => {
    const before = await snapshot("standing_runs", "organisation_id");
    const save = await orgB.admin.client.rpc("save_standing_run", {
      target_id: runA,
      run: {
        name: "Hijacked",
        days: ["mon"],
        cutoff_time: "10:00",
        start_time: "07:00",
        depot_id: settingsB.depotId,
      },
      site_ids: [customerB.siteId],
    });
    expect(save.error).not.toBeNull();
    const loadsBefore = await countFor("loads", "organisation_id", orgA.id);
    await orgB.admin.client.rpc("generate_standing_loads", {
      from_date: "2026-10-01",
      to_date: "2026-11-30",
    });
    expect(await countFor("loads", "organisation_id", orgA.id)).toBe(loadsBefore);
    expect(await snapshot("standing_runs", "organisation_id")).toEqual(before);
  });
});

describe("history search stays in the organisation", () => {
  it("finds A's deliveries for A, and nothing of A's for B", async () => {
    const { data: mine } = await member(orgA, "office").client.rpc("search_history", {
      q: "alpha-2001",
    });
    expect(mine?.map((r: { order_id: string }) => r.order_id)).toEqual([podA.orderId]);
    for (const [who, client] of intruders()) {
      const { data } = await client.rpc("search_history", { q: "alpha" });
      expect(data ?? [], who).toEqual([]);
      const byCustomer = await client.rpc("search_history", {
        target_customer: customerA.customerId,
      });
      expect(byCustomer.data ?? [], who).toEqual([]);
    }
  });

  it("filters by customer and date range in one search", async () => {
    const client = orgA.admin.client;
    const october = await client.rpc("search_history", {
      target_customer: customerA.customerId,
      date_from: "2026-10-01",
      date_to: "2026-10-31",
    });
    expect(october.error).toBeNull();
    expect(new Set(october.data?.map((r: { order_id: string }) => r.order_id))).toEqual(
      new Set([orderA.orderId, podA.orderId]),
    );
    const september = await client.rpc("search_history", {
      target_customer: customerA.customerId,
      date_from: "2026-09-01",
      date_to: "2026-09-30",
    });
    expect(september.data).toEqual([]);
    const byPo = await client.rpc("search_history", { q: "po-alpha-77" });
    expect(byPo.data?.map((r: { order_id: string }) => r.order_id)).toEqual([orderA.orderId]);
  });
});
