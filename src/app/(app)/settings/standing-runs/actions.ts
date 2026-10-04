"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, describeDbError, refresh } from "@/lib/settings/save";
import { parseStandingRun } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/standing-runs";

/** Save a run and its sites in their usual order, in one go. */
export async function saveStandingRun(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseStandingRun(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const { site_ids, ...run } = parsed.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_standing_run", {
      target_id: id,
      run,
      site_ids,
    });
    if (error) {
      if (error.code === "P0002") return { ok: false, error: error.message };
      return describeDbError(error, {
        standing_runs_name_key: { field: "name", message: "Another standing run has this name." },
      });
    }
    refresh(PATH);
    refresh("/plan");
    return { ok: true, id: data as string };
  });
}

/** Delete a run. Draft loads it already made stay on the plan. */
export async function deleteStandingRun(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("standing_runs", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
