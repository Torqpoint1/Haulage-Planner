"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { formObject } from "@/lib/settings/form";
import type { FormState } from "@/lib/settings/result";
import { asAdmin, describeDbError } from "@/lib/settings/save";
import { parseThresholds } from "@/lib/settings/thresholds";
import { createClient } from "@/lib/supabase/server";

export async function saveThresholds(_id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseThresholds(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const session = await getSession();
    const id = session!.membership!.organisation.id;
    const supabase = await createClient();
    const { error } = await supabase
      .from("organisations")
      .update({
        warning_thresholds: parsed.data.thresholds,
        site_info_stale_days: parsed.data.site_info_stale_days,
      })
      .eq("id", id);
    if (error) return describeDbError(error);
    revalidatePath("/settings/thresholds");
    return { ok: true, id };
  });
}
