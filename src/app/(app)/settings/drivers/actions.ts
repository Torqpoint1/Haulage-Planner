"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, refresh, upsertRow } from "@/lib/settings/save";
import { parseDriver } from "@/lib/settings/schemas";

const PATH = "/settings/drivers";
const UNIQUE = {
  drivers_user_key: {
    field: "user_id",
    message: "That login is already linked to another driver.",
  },
};

export async function saveDriver(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseDriver(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const result = await upsertRow("drivers", id, parsed.data, UNIQUE);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function deleteDriver(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("drivers", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
