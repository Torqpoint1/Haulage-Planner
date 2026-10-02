"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, refresh, upsertRow } from "@/lib/settings/save";
import { parseZone } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/zones";
const UNIQUE = {
  postcode_zones_name_key: { field: "name", message: "You already have a zone with this name." },
};

export async function saveZone(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseZone(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    // Each postcode area belongs to one zone, so rates and colours are never ambiguous.
    const supabase = await createClient();
    const { data: others } = await supabase
      .from("postcode_zones")
      .select("id, name, postcode_areas");
    const clashes = (others ?? [])
      .filter((z) => z.id !== id)
      .flatMap((z) =>
        (z.postcode_areas as string[])
          .filter((a) => parsed.data.postcode_areas.includes(a))
          .map((a) => `${a} (in ${z.name})`),
      );
    if (clashes.length) {
      return {
        ok: false,
        errors: {
          postcode_areas: `Already in another zone: ${clashes.join(", ")}. Remove them there first.`,
        },
      };
    }

    const result = await upsertRow("postcode_zones", id, parsed.data, UNIQUE);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function deleteZone(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("postcode_zones", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
