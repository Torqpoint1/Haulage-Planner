"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, refresh, upsertRow } from "@/lib/settings/save";
import { parseUnitType } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/unit-types";
const UNIQUE = {
  unit_types_name_key: { field: "name", message: "You already have a unit type with this name." },
  unit_types_code_key: { field: "short_code", message: "Another unit type uses this short code." },
};

export async function saveUnitType(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseUnitType(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const result = await upsertRow("unit_types", id, parsed.data, UNIQUE);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function deleteUnitType(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("unit_types", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}

/** A starting set of common pallet sizes; skips any that already exist. */
export async function addCommonPallets(): Promise<DeleteResult> {
  return asAdmin(async () => {
    const supabase = await createClient();
    const { data: existing } = await supabase.from("unit_types").select("short_code");
    const have = new Set((existing ?? []).map((r) => r.short_code));
    const starters = [
      {
        name: "Euro pallet",
        short_code: "EUR",
        colour_tag: "load-1",
        length_mm: 1200,
        width_mm: 800,
        height_mm: 1200,
        typical_weight_kg: 300,
        stackable: false,
      },
      {
        name: "UK pallet",
        short_code: "UKP",
        colour_tag: "load-3",
        length_mm: 1200,
        width_mm: 1000,
        height_mm: 1200,
        typical_weight_kg: 400,
        stackable: false,
      },
      {
        name: "Half pallet",
        short_code: "HALF",
        colour_tag: "load-6",
        length_mm: 1200,
        width_mm: 1000,
        height_mm: 800,
        typical_weight_kg: 250,
        stackable: false,
      },
      {
        name: "Quarter pallet",
        short_code: "QTR",
        colour_tag: "load-7",
        length_mm: 1200,
        width_mm: 1000,
        height_mm: 600,
        typical_weight_kg: 125,
        stackable: false,
      },
    ].filter((s) => !have.has(s.short_code));
    if (starters.length) {
      const { error } = await supabase.from("unit_types").insert(starters);
      if (error) return { ok: false, error: "Couldn't add the pallet types. Try again." };
    }
    refresh(PATH);
    return { ok: true };
  });
}
