"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { londonToday } from "@/lib/format";
import { buildContext, loadWarnings } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import { parseLoad, parseStop } from "@/lib/planning/schemas";
import { LOAD_STATUSES, type LoadStatus } from "@/lib/planning/types";
import { unresolvedBlocking } from "@/lib/rules";
import type { DeliveryOption } from "@/lib/suggestions/options";
import { adviseLoad, adviseOrder, proposeLoads, type LoadAdvice } from "@/lib/suggestions/server";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

/** Planners and admins plan loads (spec 3); RLS enforces the same. */
const plan = <T extends FormState | DeleteResult>(run: () => Promise<T>) =>
  withCapability("loads.edit", run);
const refresh = () => {
  revalidatePath("/plan");
  revalidatePath("/orders");
};
const fail = (error: string): DeleteResult => ({ ok: false, error });
const uuid = z.uuid();

/** Database errors from the planning functions carry a plain-English message. */
function planningError(error: { code?: string; message: string }): DeleteResult {
  if (error.code === "P0001" || error.code === "P0002") return fail(error.message);
  return describeDbError(error) as DeleteResult;
}

async function setDrivers(loadId: string, driverIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("load_drivers").delete().eq("load_id", loadId);
  if (error) return error;
  if (!driverIds.length) return null;
  const { error: insertError } = await supabase.from("load_drivers").insert(
    driverIds.map((driver_id) => ({ load_id: loadId, driver_id })),
    { defaultToNull: false },
  );
  return insertError;
}

export async function saveLoad(id: string | null, formData: FormData): Promise<FormState> {
  return plan(async () => {
    const parsed = parseLoad(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const { driver_ids, ...row } = parsed.data;
    const supabase = await createClient();
    const query = id
      ? supabase.from("loads").update(row).eq("id", id).select("id")
      : supabase.from("loads").insert(row).select("id");
    const { data, error } = await query;
    if (error) return describeDbError(error);
    if (!data?.length) return { ok: false, error: "This load has been deleted." };
    const driverError = await setDrivers(data[0].id, driver_ids);
    if (driverError) return describeDbError(driverError);
    refresh();
    return { ok: true, id: data[0].id };
  });
}

/** Small changes from fixes and the panel: vehicle, crew, date, start time. */
const patchSchema = z
  .object({
    vehicle_id: uuid.nullable(),
    haulier_id: uuid.nullable(),
    crew_size: z.number().int().min(1).max(4),
    load_date: z.iso.date(),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    notes: z.string().max(2000),
  })
  .partial();

export async function updateLoad(
  id: string,
  patch: z.input<typeof patchSchema>,
): Promise<DeleteResult> {
  return plan(async () => {
    const parsed = patchSchema.safeParse(patch);
    if (!parsed.success) return fail("That change isn't valid.");
    const row: Record<string, unknown> = { ...parsed.data };
    if (row.vehicle_id) row.haulier_id = null;
    if (row.haulier_id) row.vehicle_id = null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("loads")
      .update(row)
      .eq("id", id)
      .select("id, status");
    if (error) return describeDbError(error) as DeleteResult;
    if (!data?.length) return fail("This load has been deleted.");
    // A changed plan needs checking again before it's confirmed.
    if (data[0].status === "confirmed" && !("notes" in row && Object.keys(row).length === 1)) {
      await supabase.from("loads").update({ status: "planned" }).eq("id", id);
    }
    refresh();
    return { ok: true };
  });
}

export async function deleteLoad(id: string): Promise<DeleteResult> {
  return plan(async () => {
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("loads")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!current) return fail("This load has already been deleted.");
    if (["loading", "out", "complete"].includes(current.status)) {
      return fail("Loads that are loading or out can't be deleted.");
    }
    const { error } = await supabase.from("loads").delete().eq("id", id);
    if (error) return describeDbError(error) as DeleteResult;
    refresh();
    return { ok: true };
  });
}

export async function addOrderToLoad(loadId: string, orderId: string): Promise<DeleteResult> {
  return plan(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_order_to_load", {
      target_load: loadId,
      target_order: orderId,
    });
    if (error) return planningError(error);
    refresh();
    return { ok: true };
  });
}

export async function removeOrderFromLoad(orderId: string): Promise<DeleteResult> {
  return plan(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_order_from_load", { target_order: orderId });
    if (error) return planningError(error);
    refresh();
    return { ok: true };
  });
}

export async function reorderStops(loadId: string, stopIds: string[]): Promise<DeleteResult> {
  return plan(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("reorder_stops", {
      target_load: loadId,
      stop_ids: stopIds,
    });
    if (error) return planningError(error);
    refresh();
    return { ok: true };
  });
}

export async function saveStop(stopId: string, formData: FormData): Promise<FormState> {
  return plan(async () => {
    const parsed = parseStop(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("load_stops")
      .select("confirmed, confirmed_at")
      .eq("id", stopId)
      .maybeSingle();
    if (!current) return { ok: false, error: "This stop has been removed." };
    const confirmedAt = parsed.data.confirmed
      ? (current.confirmed_at ?? new Date().toISOString())
      : null;
    const { error } = await supabase
      .from("load_stops")
      .update({ ...parsed.data, confirmed_at: confirmedAt })
      .eq("id", stopId);
    if (error) return describeDbError(error);
    refresh();
    return { ok: true, id: stopId };
  });
}

const STATUS_VALUES = LOAD_STATUSES.map((s) => s.value);

/**
 * Move a load through draft → planned → confirmed → loading → out → complete.
 * Confirming re-runs every check on the server: a blocking warning that
 * hasn't been fixed or overridden stops it (spec 7.3).
 */
export async function setLoadStatus(id: string, status: LoadStatus): Promise<DeleteResult> {
  return withCapability("plans.approve", async () => {
    if (!STATUS_VALUES.includes(status)) return fail("That status isn't valid.");
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("loads")
      .select("load_date, vehicle_id, haulier_id")
      .eq("id", id)
      .maybeSingle();
    if (!current) return fail("This load has been deleted.");
    if (["confirmed", "loading", "out", "complete"].includes(status)) {
      const data = await loadPlanData(current.load_date, current.load_date);
      const load = data.loads.find((l) => l.id === id);
      if (!load) return fail("This load has been deleted.");
      if (!load.stops.length) return fail("Add at least one order before confirming.");
      if (!load.vehicle_id && !load.haulier_id)
        return fail("Choose a vehicle or haulier before confirming.");
      const ctx = buildContext(load, data, { now: new Date(), today: londonToday() });
      const blocking = unresolvedBlocking(loadWarnings(ctx, data));
      if (blocking.length && status === "confirmed") {
        return fail(
          `${blocking.length === 1 ? "A blocking warning needs" : `${blocking.length} blocking warnings need`} fixing or overriding first: ${blocking.map((w) => w.title).join("; ")}.`,
        );
      }
    }
    const { error } = await supabase.from("loads").update({ status }).eq("id", id);
    if (error) return describeDbError(error) as DeleteResult;
    refresh();
    return { ok: true };
  });
}

const decisionSchema = z.object({
  loadId: uuid,
  key: z.string().min(3).max(200),
  code: z.string().regex(/^[A-Z_]{2,40}$/),
  entityType: z.enum(["load", "stop", "order"]),
  entityId: uuid,
});
type DecisionInput = z.input<typeof decisionSchema>;

/** Override a blocking warning, with a written reason (spec 6.9). */
export async function overrideWarning(input: DecisionInput, reason: string): Promise<DeleteResult> {
  return withCapability("warnings.override", async () => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("That warning couldn't be found. Reload and try again.");
    const clean = reason.trim();
    if (clean.length < 3) return fail("Write a reason for the override.");
    if (clean.length > 1000) return fail("Keep the reason to 1,000 characters or fewer.");
    return saveDecision(parsed.data, "override", clean);
  });
}

/** Dismiss a check or info warning for this load. No reason needed, but it's logged. */
export async function dismissWarning(input: DecisionInput): Promise<DeleteResult> {
  return plan(async () => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return fail("That warning couldn't be found. Reload and try again.");
    return saveDecision(parsed.data, "dismiss", "");
  });
}

async function saveDecision(
  d: z.infer<typeof decisionSchema>,
  kind: "override" | "dismiss",
  reason: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("warning_overrides").upsert(
    {
      load_id: d.loadId,
      warning_key: d.key,
      code: d.code,
      entity_type: d.entityType,
      entity_id: d.entityId,
      kind,
      reason,
    },
    { onConflict: "load_id,warning_key" },
  );
  if (error) return describeDbError(error) as DeleteResult;
  refresh();
  return { ok: true } as DeleteResult;
}

/** Undo an override or dismissal; the warning shows again. */
export async function clearDecision(loadId: string, key: string): Promise<DeleteResult> {
  return plan(async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("warning_overrides")
      .delete()
      .eq("load_id", loadId)
      .eq("warning_key", key);
    if (error) return describeDbError(error) as DeleteResult;
    refresh();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Suggestions (spec 8). They only ever propose: every change needs a click.
// ---------------------------------------------------------------------------

const isoDate = z.iso.date();

export async function suggestLoadsAction(from: string, to: string, days: string[]) {
  return withCapability("loads.edit", async () => {
    if (![from, to, ...days].every((d) => isoDate.safeParse(d).success))
      return fail("Those dates aren't valid.");
    const result = await proposeLoads(from, to, days);
    return { ok: true as const, ...result };
  }) as Promise<
    ({ ok: true } & Awaited<ReturnType<typeof proposeLoads>>) | { ok: false; error: string }
  >;
}

const proposalSchema = z.object({
  date: isoDate,
  depotId: uuid,
  vehicleId: uuid,
  orderIds: z.array(uuid).min(1).max(200),
});

/** Turn an accepted suggestion into a real load, orders in the suggested drop order. */
export async function acceptProposal(input: z.input<typeof proposalSchema>): Promise<FormState> {
  return plan(async () => {
    const parsed = proposalSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: "That suggestion is out of date. Suggest loads again." };
    const { date, depotId, vehicleId, orderIds } = parsed.data;
    const supabase = await createClient();
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("crew_size_default")
      .eq("id", vehicleId)
      .maybeSingle();
    const { data: created, error } = await supabase
      .from("loads")
      .insert({
        load_date: date,
        depot_id: depotId,
        vehicle_id: vehicleId,
        crew_size: vehicle?.crew_size_default ?? 1,
      })
      .select("id")
      .single();
    if (error) return describeDbError(error);
    for (const orderId of orderIds) {
      const { error: addError } = await supabase.rpc("add_order_to_load", {
        target_load: created.id,
        target_order: orderId,
      });
      if (addError) {
        // All or nothing: take the half-made load away again.
        await supabase.from("loads").delete().eq("id", created.id);
        return { ok: false, error: `${addError.message} Suggest loads again to get a fresh plan.` };
      }
    }
    refresh();
    return { ok: true, id: created.id };
  });
}

export async function loadAdviceAction(loadId: string) {
  return withCapability("loads.edit", async () => {
    if (!uuid.safeParse(loadId).success) return fail("That load couldn't be found.");
    const supabase = await createClient();
    const { data: load } = await supabase
      .from("loads")
      .select("load_date")
      .eq("id", loadId)
      .maybeSingle();
    if (!load) return fail("This load has been deleted.");
    const advice = await adviseLoad(loadId, load.load_date);
    return advice ? { ok: true as const, ...advice } : fail("This load has been deleted.");
  }) as Promise<({ ok: true } & LoadAdvice) | { ok: false; error: string }>;
}

export async function orderOptionsAction(orderId: string) {
  return withCapability("loads.edit", async () => {
    if (!uuid.safeParse(orderId).success) return fail("That order couldn't be found.");
    const supabase = await createClient();
    const { data: order } = await supabase
      .from("orders")
      .select("required_date")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return fail("That order couldn't be found.");
    const result = await adviseOrder(orderId, order.required_date);
    return result ? { ok: true as const, ...result } : fail("That order couldn't be compared.");
  }) as Promise<
    { ok: true; date: string; options: DeliveryOption[] } | { ok: false; error: string }
  >;
}

/**
 * Add orders suggested by a standing run (spec 6.12), then put the stops in the
 * run's usual site order; any other stops keep their order after them.
 */
export async function addStandingOrders(loadId: string, orderIds: string[]): Promise<DeleteResult> {
  return plan(async () => {
    if (
      !uuid.safeParse(loadId).success ||
      !z.array(uuid).min(1).max(100).safeParse(orderIds).success
    )
      return fail("Choose the orders to add.");
    const supabase = await createClient();
    for (const orderId of orderIds) {
      const { error } = await supabase.rpc("add_order_to_load", {
        target_load: loadId,
        target_order: orderId,
      });
      if (error) return planningError(error);
    }
    const { data: load } = await supabase
      .from("loads")
      .select("standing_run_id, stops:load_stops(id, site_id, sequence)")
      .eq("id", loadId)
      .single();
    if (load?.standing_run_id) {
      const { data: sites } = await supabase
        .from("standing_run_sites")
        .select("site_id, position")
        .eq("run_id", load.standing_run_id);
      const pos = new Map((sites ?? []).map((s) => [s.site_id, s.position]));
      const stops = [
        ...((load.stops ?? []) as { id: string; site_id: string; sequence: number }[]),
      ];
      stops.sort(
        (a, b) =>
          (pos.get(a.site_id) ?? 1000 + a.sequence) - (pos.get(b.site_id) ?? 1000 + b.sequence),
      );
      const { error } = await supabase.rpc("reorder_stops", {
        target_load: loadId,
        stop_ids: stops.map((s) => s.id),
      });
      if (error) return planningError(error);
    }
    refresh();
    return { ok: true };
  });
}
