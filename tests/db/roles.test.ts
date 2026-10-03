import { beforeAll, describe, expect, it } from "vitest";
import { createCustomer, createLoad, createOrder, createSettings } from "./fixtures";
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

describe("customers: planners and admins edit, everyone else only reads (spec 3)", () => {
  let fixture: Awaited<ReturnType<typeof createCustomer>>;

  beforeAll(async () => {
    fixture = await createCustomer(member(org, "planner").client, "planned");
  });

  it("planners can create customers, sites and contacts", () => {
    expect(fixture.siteId).toBeTruthy();
  });

  for (const role of ["office", "warehouse", "driver"] as const) {
    it(`${role} can read customers and sites but not change them`, async () => {
      const { client } = member(org, role);
      const { data: sites } = await client.from("sites").select("id").eq("id", fixture.siteId);
      expect(sites).toHaveLength(1);

      const added = await client.from("customers").insert({ name: `${role} customer` });
      expect(added.error).not.toBeNull();
      const changed = await client
        .from("sites")
        .update({ no_hgvs: false })
        .eq("id", fixture.siteId)
        .select();
      expect(changed.data ?? []).toEqual([]);
      const removed = await client.from("contacts").delete().eq("id", fixture.contactId).select();
      expect(removed.data ?? []).toEqual([]);
      const verified = await client.rpc("verify_site", { target_site_id: fixture.siteId });
      expect(verified.error).not.toBeNull();
    });
  }

  it("marking a site as verified records who and when", async () => {
    const planner = member(org, "planner");
    const { error } = await planner.client.rpc("verify_site", { target_site_id: fixture.siteId });
    expect(error).toBeNull();
    const { data } = await service
      .from("sites")
      .select("last_verified_at, verified_by")
      .eq("id", fixture.siteId)
      .single();
    expect(data?.verified_by).toBe(planner.id);
    expect(Date.now() - new Date(data!.last_verified_at).getTime()).toBeLessThan(60_000);
  });

  it("a contact's site must belong to the same customer", async () => {
    const other = await createCustomer(org.admin.client, "other");
    const { error } = await org.admin.client
      .from("contacts")
      .insert({ customer_id: fixture.customerId, site_id: other.siteId, name: "Mixed up" });
    expect(error).not.toBeNull();
  });

  it("deleting a customer removes its sites and contacts", async () => {
    const doomed = await createCustomer(org.admin.client, "doomed");
    await org.admin.client.from("customers").delete().eq("id", doomed.customerId);
    const { data: sites } = await service.from("sites").select("id").eq("id", doomed.siteId);
    const { data: contacts } = await service
      .from("contacts")
      .select("id")
      .eq("id", doomed.contactId);
    expect(sites).toEqual([]);
    expect(contacts).toEqual([]);
  });
});

describe("orders: planners edit, office staff view and see history (spec 3, 9.3)", () => {
  let order: Awaited<ReturnType<typeof createOrder>>;
  let settings: Awaited<ReturnType<typeof createSettings>>;

  beforeAll(async () => {
    settings = await createSettings(org.admin.client, "ordering");
    const customer = await createCustomer(org.admin.client, "ordering");
    order = await createOrder(member(org, "planner").client, "role", settings, customer);
  });

  it("search text covers every reference, the customer and the postcode", async () => {
    const { data } = await service
      .from("orders")
      .select("search_text")
      .eq("id", order.orderId)
      .single();
    for (const term of [
      "role-1001",
      "po-role-77",
      "dn-role-55",
      "inv-role-33",
      "ordering builders",
      "gl1 2bb",
      "gl12bb",
    ]) {
      expect(data?.search_text).toContain(term);
    }
  });

  it("renaming the customer updates order search", async () => {
    const { data: o } = await service
      .from("orders")
      .select("customer_id")
      .eq("id", order.orderId)
      .single();
    await org.admin.client
      .from("customers")
      .update({ name: "Renamed Trading" })
      .eq("id", o!.customer_id);
    const { data } = await service
      .from("orders")
      .select("search_text")
      .eq("id", order.orderId)
      .single();
    expect(data?.search_text).toContain("renamed trading");
  });

  it("office staff can read orders and their history but not change them", async () => {
    const { client } = member(org, "office");
    const { data: rows } = await client.from("orders").select("id").eq("id", order.orderId);
    expect(rows).toHaveLength(1);
    const { data: history } = await client
      .from("audit_log")
      .select("table_name")
      .eq("record_id", order.orderId);
    expect(history?.length).toBeGreaterThan(0);
    // Office staff still can't see the rest of the audit log.
    const { data: other } = await client
      .from("audit_log")
      .select("id")
      .eq("table_name", "memberships");
    expect(other).toEqual([]);

    const changed = await client
      .from("orders")
      .update({ readiness: "ready" })
      .eq("id", order.orderId)
      .select();
    expect(changed.data ?? []).toEqual([]);
    const saved = await client.rpc("save_order", {
      target_order_id: order.orderId,
      order_data: {},
      lines: [],
    });
    expect(saved.error).not.toBeNull();
  });

  it("saving an order replaces its lines in one go", async () => {
    const planner = member(org, "planner");
    const { data: current } = await service
      .from("orders")
      .select("*")
      .eq("id", order.orderId)
      .single();
    const { error } = await planner.client.rpc("save_order", {
      target_order_id: order.orderId,
      order_data: { ...current, readiness: "part_ready", missing_items: "2 door frames" },
      lines: [
        { unit_type_id: settings.unitTypeId, quantity: 2, weight_per_unit_kg: 140 },
        {
          unit_type_id: settings.unitTypeId,
          quantity: 1,
          weight_per_unit_kg: 90,
          description: "Spare frame",
        },
      ],
    });
    expect(error).toBeNull();
    const { data: lines } = await service
      .from("order_lines")
      .select("quantity, position")
      .eq("order_id", order.orderId)
      .order("position");
    expect(lines).toEqual([
      { quantity: 2, position: 0 },
      { quantity: 1, position: 1 },
    ]);
  });

  it("a unit type in use on an order can't be deleted", async () => {
    const { error } = await org.admin.client
      .from("unit_types")
      .delete()
      .eq("id", settings.unitTypeId);
    expect(error?.code).toBe("23503");
  });

  it("an import is all or nothing", async () => {
    const planner = member(org, "planner");
    const { data: current } = await service
      .from("orders")
      .select("customer_id, site_id")
      .eq("id", order.orderId)
      .single();
    const good = {
      order: { ...current, order_ref: "IMP-1", required_date: "2026-10-20" },
      lines: [],
    };
    const bad = {
      order: { ...current, order_ref: "IMP-2", required_date: "not a date" },
      lines: [],
    };
    const { error } = await planner.client.rpc("import_orders", { orders: [good, bad] });
    expect(error).not.toBeNull();
    const { data } = await service.from("orders").select("id").eq("order_ref", "IMP-1");
    expect(data).toEqual([]);
  });
});

describe("planning: loads, stops and order status (spec 6.8, 7.3)", () => {
  let settings: Awaited<ReturnType<typeof createSettings>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;
  let otherSiteId: string;
  const planner = () => member(org, "planner").client;

  beforeAll(async () => {
    settings = await createSettings(org.admin.client, "planning");
    customer = await createCustomer(org.admin.client, "planning");
    const { data } = await org.admin.client
      .from("sites")
      .insert({ customer_id: customer.customerId, name: "Second yard", postcode: "GL5 3QF" })
      .select("id")
      .single();
    otherSiteId = data!.id;
  });

  async function newOrder(ref: string, siteId = customer.siteId) {
    const { data, error } = await planner().rpc("save_order", {
      target_order_id: null,
      order_data: {
        customer_id: customer.customerId,
        site_id: siteId,
        order_ref: ref,
        required_date: "2026-10-12",
      },
      lines: [{ unit_type_id: settings.unitTypeId, quantity: 2, weight_per_unit_kg: 100 }],
    });
    if (error) throw error;
    return data as string;
  }
  async function newLoad() {
    const { data, error } = await planner()
      .from("loads")
      .insert({
        load_date: "2026-10-12",
        depot_id: settings.depotId,
        vehicle_id: settings.vehicleId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  const status = async (orderId: string) =>
    (await service.from("orders").select("status").eq("id", orderId).single()).data?.status;
  const stops = async (loadId: string) =>
    (
      await service
        .from("load_stops")
        .select("id, site_id, sequence")
        .eq("load_id", loadId)
        .order("sequence")
    ).data ?? [];

  it("orders for the same site share a stop; another site gets the next stop", async () => {
    const load = await newLoad();
    const [a, b, c] = [
      await newOrder("PL-1"),
      await newOrder("PL-2"),
      await newOrder("PL-3", otherSiteId),
    ];
    for (const o of [a, b, c]) {
      const { error } = await planner().rpc("add_order_to_load", {
        target_load: load,
        target_order: o,
      });
      expect(error).toBeNull();
    }
    const list = await stops(load);
    expect(list.map((s) => [s.site_id, s.sequence])).toEqual([
      [customer.siteId, 1],
      [otherSiteId, 2],
    ]);
    expect(await status(a)).toBe("planned");
    const { data: loadRow } = await service.from("loads").select("status").eq("id", load).single();
    expect(loadRow?.status).toBe("planned");

    // Reorder, then remove the only order at the first stop: the stop goes and the rest close up.
    const { error: reorder } = await planner().rpc("reorder_stops", {
      target_load: load,
      stop_ids: [list[1].id, list[0].id],
    });
    expect(reorder).toBeNull();
    expect((await stops(load)).map((s) => s.site_id)).toEqual([otherSiteId, customer.siteId]);
    await planner().rpc("remove_order_from_load", { target_order: c });
    expect(await status(c)).toBe("unplanned");
    expect((await stops(load)).map((s) => [s.site_id, s.sequence])).toEqual([[customer.siteId, 1]]);

    // A reorder that doesn't list every stop is refused.
    const bad = await planner().rpc("reorder_stops", { target_load: load, stop_ids: [] });
    expect(bad.error?.message).toMatch(/stops changed/);
  });

  it("moving an order to another load takes it off the first; deleting a load frees its orders", async () => {
    const [first, second] = [await newLoad(), await newLoad()];
    const order = await newOrder("PL-4");
    await planner().rpc("add_order_to_load", { target_load: first, target_order: order });
    await planner().rpc("add_order_to_load", { target_load: second, target_order: order });
    expect(await stops(first)).toEqual([]);
    expect(await stops(second)).toHaveLength(1);
    await planner().from("loads").delete().eq("id", second);
    expect(await status(order)).toBe("unplanned");
  });

  it("order status follows the load, and editing a confirmed load sends it back to planned", async () => {
    const load = await newLoad();
    const order = await newOrder("PL-5");
    await planner().rpc("add_order_to_load", { target_load: load, target_order: order });
    await planner().from("loads").update({ status: "confirmed" }).eq("id", load);
    const extra = await newOrder("PL-6");
    await planner().rpc("add_order_to_load", { target_load: load, target_order: extra });
    const { data } = await service.from("loads").select("status").eq("id", load).single();
    expect(data?.status).toBe("planned");

    await planner().from("loads").update({ status: "loading" }).eq("id", load);
    expect(await status(order)).toBe("loaded");
    const locked = await planner().rpc("remove_order_from_load", { target_order: order });
    expect(locked.error?.message).toMatch(/left the planning stage/);
    await planner().from("loads").update({ status: "out" }).eq("id", load);
    expect(await status(order)).toBe("out_for_delivery");
  });

  it("cancelled orders can't be planned", async () => {
    const load = await newLoad();
    const order = await newOrder("PL-7");
    await planner().from("orders").update({ status: "cancelled" }).eq("id", order);
    const { error } = await planner().rpc("add_order_to_load", {
      target_load: load,
      target_order: order,
    });
    expect(error?.message).toMatch(/cancelled and can't be planned/);
  });

  it("an override needs a written reason; a dismissal doesn't", async () => {
    const load = await newLoad();
    const row = { load_id: load, code: "CAPACITY_WEIGHT", entity_type: "load", entity_id: load };
    const noReason = await planner()
      .from("warning_overrides")
      .insert({ ...row, warning_key: "a", kind: "override", reason: " " });
    expect(noReason.error).not.toBeNull();
    const dismiss = await planner()
      .from("warning_overrides")
      .insert({ ...row, warning_key: "b", kind: "dismiss" });
    expect(dismiss.error).toBeNull();
    const { data: logged } = await service
      .from("audit_log")
      .select("action")
      .eq("table_name", "warning_overrides")
      .eq("organisation_id", org.id);
    expect(logged?.length).toBeGreaterThan(0);
  });

  for (const role of ["office", "warehouse", "driver"] as const) {
    it(`${role} can see loads but not plan them`, async () => {
      const order = await newOrder(`PL-${role}`);
      const fixture = await createLoad(planner(), settings, { orderId: order, quoteRequestId: "" });
      const { client } = member(org, role);
      const { data: seen } = await client.from("loads").select("id").eq("id", fixture.loadId);
      expect(seen).toHaveLength(1);
      const { data: changed } = await client
        .from("loads")
        .update({ status: "confirmed" })
        .eq("id", fixture.loadId)
        .select();
      expect(changed ?? []).toEqual([]);
      await client.rpc("remove_order_from_load", { target_order: order });
      expect(await status(order)).toBe("planned");
      const insert = await client
        .from("loads")
        .insert({ load_date: "2026-10-12", depot_id: settings.depotId });
      expect(insert.error).not.toBeNull();
      const override = await client.from("warning_overrides").insert({
        load_id: fixture.loadId,
        warning_key: "x",
        code: "CAPACITY_SPACE",
        entity_type: "load",
        entity_id: fixture.loadId,
        kind: "dismiss",
      });
      expect(override.error).not.toBeNull();
    });
  }

  it("every organisation starts with compliance zones that only admins can change", async () => {
    const { data } = await member(org, "office")
      .client.from("compliance_zones")
      .select("name, requirement");
    expect(data?.map((z) => z.name)).toContain("London HGV Safety Permit");
    expect(data?.find((z) => z.name === "Birmingham Clean Air Zone")?.requirement).toBe(
      "caz_compliant",
    );
    const { data: changed } = await planner()
      .from("compliance_zones")
      .update({ active: false })
      .eq("organisation_id", org.id)
      .select();
    expect(changed ?? []).toEqual([]);
  });
});

describe("warehouse: pickers tick lines, others can't (spec 3, 9.5)", () => {
  let settings: Awaited<ReturnType<typeof createSettings>>;
  let customer: Awaited<ReturnType<typeof createCustomer>>;

  beforeAll(async () => {
    settings = await createSettings(org.admin.client, "picking");
    customer = await createCustomer(org.admin.client, "picking");
  });

  async function plannedLine(ref: string) {
    const { data: orderId } = await member(org, "planner").client.rpc("save_order", {
      target_order_id: null,
      order_data: {
        customer_id: customer.customerId,
        site_id: customer.siteId,
        order_ref: ref,
        required_date: "2026-10-12",
      },
      lines: [{ unit_type_id: settings.unitTypeId, quantity: 3, weight_per_unit_kg: 100 }],
    });
    const { data: load } = await member(org, "planner")
      .client.from("loads")
      .insert({ load_date: "2026-10-12", depot_id: settings.depotId })
      .select("id")
      .single();
    await member(org, "planner").client.rpc("add_order_to_load", {
      target_load: load!.id,
      target_order: orderId,
    });
    const { data: line } = await service
      .from("order_lines")
      .select("id")
      .eq("order_id", orderId)
      .single();
    return { orderId: orderId as string, loadId: load!.id as string, lineId: line!.id as string };
  }
  const pick = async (lineId: string) =>
    (await service.from("pick_lines").select("*").eq("order_line_id", lineId).maybeSingle()).data;

  it("a picker ticks picked and loaded, and who and when are recorded", async () => {
    const { lineId } = await plannedLine("PK-1");
    const picker = member(org, "warehouse");
    expect(
      (await picker.client.rpc("tick_line", { target_line: lineId, set_picked: true })).error,
    ).toBeNull();
    expect(
      (await picker.client.rpc("tick_line", { target_line: lineId, set_loaded: true })).error,
    ).toBeNull();
    const row = await pick(lineId);
    expect(row).toMatchObject({
      picked: true,
      loaded: true,
      picked_by: picker.id,
      loaded_by: picker.id,
    });
    expect(row?.picked_at).not.toBeNull();
    await picker.client.rpc("tick_line", { target_line: lineId, set_picked: false });
    expect(await pick(lineId)).toMatchObject({
      picked: false,
      picked_at: null,
      picked_by: null,
      loaded: true,
    });
  });

  it("a shortage needs a note, and clearing it clears the note", async () => {
    const { lineId } = await plannedLine("PK-2");
    const picker = member(org, "warehouse").client;
    const bare = await picker.rpc("tick_line", {
      target_line: lineId,
      set_shortage: true,
      note: " ",
    });
    expect(bare.error).not.toBeNull();
    await picker.rpc("tick_line", {
      target_line: lineId,
      set_shortage: true,
      note: "1 frame short",
    });
    expect(await pick(lineId)).toMatchObject({ shortage: true, shortage_note: "1 frame short" });
    await picker.rpc("tick_line", { target_line: lineId, set_shortage: false });
    expect(await pick(lineId)).toMatchObject({ shortage: false, shortage_note: "" });
  });

  it("taking the order off the load clears its progress; loads that have left are locked", async () => {
    const first = await plannedLine("PK-3");
    await member(org, "warehouse").client.rpc("tick_line", {
      target_line: first.lineId,
      set_picked: true,
    });
    await member(org, "planner").client.rpc("remove_order_from_load", {
      target_order: first.orderId,
    });
    expect(await pick(first.lineId)).toBeNull();
    const off = await member(org, "warehouse").client.rpc("tick_line", {
      target_line: first.lineId,
      set_picked: true,
    });
    expect(off.error?.message).toMatch(/no longer on a load/);

    const second = await plannedLine("PK-4");
    await member(org, "planner")
      .client.from("loads")
      .update({ status: "out" })
      .eq("id", second.loadId);
    const late = await member(org, "warehouse").client.rpc("tick_line", {
      target_line: second.lineId,
      set_loaded: true,
    });
    expect(late.error?.message).toMatch(/already left/);
  });

  for (const role of ["office", "driver"] as const) {
    it(`${role} can't tick lines`, async () => {
      const { lineId } = await plannedLine(`PK-${role}`);
      const { error } = await member(org, role).client.rpc("tick_line", {
        target_line: lineId,
        set_picked: true,
      });
      expect(error).not.toBeNull();
      expect(await pick(lineId)).toBeNull();
    });
  }
});
