"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { londonToday } from "@/lib/format";
import { buildContext, loadWarnings } from "@/lib/planning/build";
import { loadPlanData } from "@/lib/planning/data";
import { parseLoad, parseStop } from "@/lib/planning/schemas";
import { LOAD_STATUSES, type LoadStatus } from "@/lib/planning/types";
import { unresolvedBlocking } from "@/lib/rules";
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
