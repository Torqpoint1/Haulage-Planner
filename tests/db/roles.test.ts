import { beforeAll, describe, expect, it } from "vitest";
import { createSettings } from "./fixtures";
import { createOrg, member, service, type Role, type TestOrg } from "./helpers";

/**
 * Spec section 3: roles are enforced on the server, not just hidden in the
 * interface. These run against the database directly, bypassing the UI.
 */

let org: TestOrg;
const NON_ADMINS: Exclude<Role, "admin">[] = ["planner", "office", "warehouse", "driver"];

beforeAll(async () => {
  org = await createOrg("roles", NON_ADMINS);
}, 60_000);

async function roleOf(userId: string) {
  const { data } = await service.from("memberships").select("role").eq("user_id", userId).single();
  return data?.role;
}

describe("only admins manage the organisation and its users", () => {
  for (const role of NON_ADMINS) {
    it(`${role} cannot change settings, roles, members or invitations`, async () => {
      const { client } = member(org, role);

      const { data: orgUpdate } = await client
        .from("organisations")
        .update({ name: "Renamed" })
        .eq("id", org.id)
        .select();
      expect(orgUpdate ?? []).toEqual([]);

      // Including promoting themselves.
      const self = member(org, role);
      const { data: promote } = await client
        .from("memberships")
        .update({ role: "admin" })
        .eq("user_id", self.id)
        .select();
      expect(promote ?? []).toEqual([]);
      expect(await roleOf(self.id)).toBe(role);

      const { data: removed } = await client
        .from("memberships")
        .delete()
        .eq("user_id", org.admin.id)
        .select();
      expect(removed ?? []).toEqual([]);

      const invite = await client.rpc("create_invitation", {
        invite_email: `${role}-friend@example.test`,
        invite_role: "admin",
      });
      expect(invite.error?.message).toMatch(/Only admins/);

      const { data: invitations } = await client.from("invitations").select("*");
      expect(invitations ?? []).toEqual([]);

      const { data: audit } = await client.from("audit_log").select("*");
      expect(audit ?? []).toEqual([]);
    });
  }

  it("every member can see who else is in their organisation", async () => {
    const { data } = await member(org, "office").client.from("memberships").select("role");
    expect(data).toHaveLength(5);
  });

  it("admins can change a role, and it is audited with before and after", async () => {
    const office = member(org, "office");
    const { data, error } = await org.admin.client
      .from("memberships")
      .update({ role: "planner" })
      .eq("user_id", office.id)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { data: audit } = await org.admin.client
      .from("audit_log")
      .select("action, actor_id, before, after")
      .eq("table_name", "memberships")
      .eq("action", "update")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit?.actor_id).toBe(org.admin.id);
    expect(audit?.before.role).toBe("office");
    expect(audit?.after.role).toBe("planner");

    await org.admin.client.from("memberships").update({ role: "office" }).eq("user_id", office.id);
  });

  it("the last admin cannot be demoted or removed", async () => {
    const demote = await org.admin.client
      .from("memberships")
      .update({ role: "planner" })
      .eq("user_id", org.admin.id);
    expect(demote.error?.message).toMatch(/at least one admin/);
    const remove = await org.admin.client.from("memberships").delete().eq("user_id", org.admin.id);
    expect(remove.error?.message).toMatch(/at least one admin/);
    expect(await roleOf(org.admin.id)).toBe("admin");
  });

  it("memberships cannot be moved to another user or organisation", async () => {
    const office = member(org, "office");
    const { error } = await org.admin.client
      .from("memberships")
      .update({ user_id: org.admin.id })
      .eq("user_id", office.id);
    expect(error).not.toBeNull();
  });

  it("a user cannot create or join a second organisation", async () => {
    const { error } = await member(org, "planner").client.rpc("create_organisation", {
      organisation_name: "Side hustle",
    });
    expect(error?.message).toMatch(/already belong/);
  });

  it("users can rename themselves but not change their email or anyone else", async () => {
    const planner = member(org, "planner");
    const own = await planner.client
      .from("profiles")
      .update({ full_name: "Pat Planner" })
      .eq("id", planner.id)
      .select();
    expect(own.data).toHaveLength(1);
    const email = await planner.client
      .from("profiles")
      .update({ email: "spoof@example.test" })
      .eq("id", planner.id);
    expect(email.error).not.toBeNull();
    const other = await planner.client
      .from("profiles")
      .update({ full_name: "Changed" })
      .eq("id", org.admin.id)
      .select();
    expect(other.data ?? []).toEqual([]);
  });
});

describe("invitations", () => {
  it("can be cancelled by an admin and then no longer work", async () => {
    const { data } = await org.admin.client
      .rpc("create_invitation", { invite_email: "cancelled@example.test", invite_role: "planner" })
      .single<{ invitation_id: string; token: string }>();
    await org.admin.client.rpc("revoke_invitation", { target_invitation_id: data!.invitation_id });
    const { data: info } = await org.admin.client.rpc("get_invitation", {
      invite_token: data!.token,
    });
    expect(info[0].status).toBe("revoked");
  });

  it("re-inviting the same email replaces the old link", async () => {
    const first = await org.admin.client
      .rpc("create_invitation", { invite_email: "twice@example.test", invite_role: "office" })
      .single<{ token: string }>();
    await org.admin.client.rpc("create_invitation", {
      invite_email: "Twice@Example.test",
      invite_role: "planner",
    });
    const { data } = await org.admin.client.rpc("get_invitation", {
      invite_token: first.data!.token,
    });
    expect(data[0].status).toBe("revoked");
  });

  it("expired invitations cannot be accepted", async () => {
    const { data } = await org.admin.client
      .rpc("create_invitation", { invite_email: "late@example.test", invite_role: "office" })
      .single<{ invitation_id: string; token: string }>();
    await service
      .from("invitations")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", data!.invitation_id);
    const { data: info } = await org.admin.client.rpc("get_invitation", {
      invite_token: data!.token,
    });
    expect(info[0].status).toBe("expired");
  });

  it("the token is never stored or logged in plain text", async () => {
    const { data } = await org.admin.client
      .rpc("create_invitation", { invite_email: "secret@example.test", invite_role: "office" })
      .single<{ invitation_id: string; token: string }>();
    const { data: row } = await service
      .from("invitations")
      .select("token_hash")
      .eq("id", data!.invitation_id)
      .single();
    expect(row?.token_hash).not.toBe(data!.token);
    const { data: audit } = await service
      .from("audit_log")
      .select("after")
      .eq("record_id", data!.invitation_id);
    expect(JSON.stringify(audit)).not.toContain(data!.token);
    expect(JSON.stringify(audit)).not.toContain("token_hash");
  });
});

describe("file permissions by role", () => {
  const bucket = "organisation-files";
  for (const [role, canUpload] of [
    ["planner", true],
    ["driver", true],
    ["office", false],
    ["warehouse", false],
  ] as const) {
    it(`${role} ${canUpload ? "can" : "cannot"} upload`, async () => {
      const { error } = await member(org, role)
        .client.storage.from(bucket)
        .upload(`${org.id}/${role}-${Date.now()}.txt`, new Blob(["x"]));
      expect(error === null).toBe(canUpload);
    });
  }
});

describe("settings: everyone reads, only admins change (spec 3)", () => {
  let settings: Awaited<ReturnType<typeof createSettings>>;

  beforeAll(async () => {
    settings = await createSettings(org.admin.client, "roles");
  });

  for (const role of NON_ADMINS) {
    it(`${role} can read settings but not add, change or delete them`, async () => {
      const { client } = member(org, role);

      const { data: vehicles } = await client.from("vehicles").select("id");
      expect(vehicles?.map((v) => v.id)).toContain(settings.vehicleId);

      const added = await client
        .from("depots")
        .insert({ name: `${role} depot`, postcode: "GL1 1AA" });
      expect(added.error).not.toBeNull();

      const changed = await client
        .from("vehicles")
        .update({ name: "Renamed" })
        .eq("id", settings.vehicleId)
        .select();
      expect(changed.data ?? []).toEqual([]);

      const deleted = await client
        .from("unit_types")
        .delete()
        .eq("id", settings.unitTypeId)
        .select();
      expect(deleted.data ?? []).toEqual([]);

      await client.rpc("save_vehicle_capacities", {
        target_vehicle_id: settings.vehicleId,
        capacities: [],
      });
      const { data: caps } = await service
        .from("vehicle_capacities")
        .select("id")
        .eq("vehicle_id", settings.vehicleId);
      expect(caps).toHaveLength(1);
    });
  }

  it("admins can change settings, and changes are audited", async () => {
    const { error } = await org.admin.client
      .from("vehicles")
      .update({ cost_per_mile: 0.85 })
      .eq("id", settings.vehicleId);
    expect(error).toBeNull();
    const { data } = await org.admin.client
      .from("audit_log")
      .select("before, after")
      .eq("record_id", settings.vehicleId)
      .eq("action", "update")
      .single();
    expect(Number(data?.before.cost_per_mile)).toBe(0);
    expect(Number(data?.after.cost_per_mile)).toBe(0.85);
  });

  it("deleting a unit type removes it from vehicle capacities", async () => {
    const extra = await org.admin.client
      .from("unit_types")
      .insert({ name: "Cage", short_code: "CG", length_mm: 1, width_mm: 1, height_mm: 1 })
      .select("id")
      .single();
    await org.admin.client.rpc("save_vehicle_capacities", {
      target_vehicle_id: settings.vehicleId,
      capacities: [
        { unit_type_id: settings.unitTypeId, max_units: 6 },
        { unit_type_id: extra.data!.id, max_units: 4 },
      ],
    });
    await org.admin.client.from("unit_types").delete().eq("id", extra.data!.id);
    const { data } = await service
      .from("vehicle_capacities")
      .select("unit_type_id")
      .eq("vehicle_id", settings.vehicleId);
    expect(data).toEqual([{ unit_type_id: settings.unitTypeId }]);
  });
});
