"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, refresh, upsertRow } from "@/lib/settings/save";
import { parseDepot } from "@/lib/settings/schemas";
import { lookupPostcode } from "@/lib/services/postcodes";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/depots";
const UNIQUE = {
  depots_name_key: { field: "name", message: "You already have a depot with this name." },
};

export async function saveDepot(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseDepot(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const supabase = await createClient();

    // Look the postcode up again only when it changed or was never found.
    let location: { latitude: number | null; longitude: number | null } | undefined;
    const { data: current } = id
      ? await supabase.from("depots").select("postcode, latitude").eq("id", id).maybeSingle()
      : { data: null };
    if (!current || current.postcode !== parsed.data.postcode || current.latitude === null) {
      const found = await lookupPostcode(parsed.data.postcode);
      location = { latitude: found?.latitude ?? null, longitude: found?.longitude ?? null };
    }

    // Only one default depot: clear the old one first.
    if (parsed.data.is_default) {
      let clear = supabase.from("depots").update({ is_default: false }).eq("is_default", true);
      if (id) clear = clear.neq("id", id);
      await clear;
    }

    const result = await upsertRow("depots", id, { ...parsed.data, ...location }, UNIQUE);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function deleteDepot(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("depots", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
