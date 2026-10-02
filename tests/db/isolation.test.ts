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
import { SETTINGS_TABLES, createSettings, type SettingsFixture } from "./fixtures";

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
