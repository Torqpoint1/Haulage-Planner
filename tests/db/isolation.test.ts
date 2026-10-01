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

/**
 * Spec section 5 and Stage 1 "Done when": a user from Organisation A cannot
 * read, list, update or delete anything belonging to Organisation B, through
 * any route (tables, functions, storage), and neither can anyone signed out.
 */

let orgA: TestOrg;
let orgB: TestOrg;
let outsider: TestUser;
let inviteA: { id: string; token: string };
const fileA = () => `${orgA.id}/documents/delivery-note.txt`;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([
    createOrg("alpha", ["planner", "office", "warehouse", "driver"]),
    createOrg("bravo", ["planner"]),
  ]);
  outsider = await createUser("outsider");

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
const TABLES = [
  { table: "organisations", orgColumn: "id" },
  { table: "memberships", orgColumn: "organisation_id" },
  { table: "invitations", orgColumn: "organisation_id" },
  { table: "audit_log", orgColumn: "organisation_id" },
] as const;

/** Clients that must never see Organisation A's data. */
function intruders(): [string, SupabaseClient][] {
  return [
    ["Organisation B admin", orgB.admin.client],
    ["Organisation B planner", member(orgB, "planner").client],
    ["signed-in user with no organisation", outsider.client],
    ["signed-out visitor", anonymous()],
  ];
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

  for (const { table, orgColumn } of TABLES) {
    describe(table, () => {
      it("cannot be read or listed", async () => {
        for (const [who, client] of intruders()) {
          const filtered = await client.from(table).select("*").eq(orgColumn, orgA.id);
          expect(filtered.data ?? [], `${who}: filtered`).toEqual([]);
          const all = await client.from(table).select(orgColumn);
          const leaked = (all.data ?? []).filter(
            (r) => (r as Record<string, string>)[orgColumn] === orgA.id,
          );
          expect(leaked, `${who}: listing`).toEqual([]);
        }
      });

      it("cannot be updated", async () => {
        const before = await countFor(table, orgColumn, orgA.id);
        const patch =
          table === "organisations"
            ? { name: "Hijacked" }
            : table === "memberships"
              ? { role: "admin" }
              : { email: "x@example.test" };
        for (const [who, client] of intruders()) {
          const { data } = await client.from(table).update(patch).eq(orgColumn, orgA.id).select();
          expect(data ?? [], who).toEqual([]);
        }
        expect(await countFor(table, orgColumn, orgA.id)).toBe(before);
        if (table === "organisations") {
          const { data } = await service
            .from("organisations")
            .select("name")
            .eq("id", orgA.id)
            .single();
          expect(data?.name).toBe("alpha Ltd");
        }
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
