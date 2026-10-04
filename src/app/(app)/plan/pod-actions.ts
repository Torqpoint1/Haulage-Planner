"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccess } from "@/lib/auth/roles";
import { requireMember } from "@/lib/auth/session";
import { loadPodDetails, type PodDetails } from "@/lib/drivers/details";
import type { DeleteResult } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

/** Proof of delivery for a stop. Anyone who can see the plan or the history can see it. */
export async function podDetailsAction(
  stopId: string,
): Promise<{ ok: true; pod: PodDetails | null } | { ok: false; error: string }> {
  const session = await requireMember();
  const role = session.membership.role;
  if (!canAccess(role, "plan") && !canAccess(role, "history")) {
    return { ok: false, error: "You don't have access to that." };
  }
  if (!z.uuid().safeParse(stopId).success) return { ok: false, error: "That stop doesn't exist." };
  return { ok: true, pod: await loadPodDetails(stopId) };
}

/** Take a failed order off its finished load so it can be planned again. */
export async function replanFailedOrder(orderId: string): Promise<DeleteResult> {
  return withCapability("loads.edit", async () => {
    if (!z.uuid().safeParse(orderId).success)
      return { ok: false, error: "That order doesn't exist." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("replan_failed_order", { target_order: orderId });
    if (error) {
      if (error.code === "P0001" || error.code === "P0002")
        return { ok: false, error: error.message };
      return describeDbError(error) as DeleteResult;
    }
    revalidatePath("/plan");
    return { ok: true };
  });
}
