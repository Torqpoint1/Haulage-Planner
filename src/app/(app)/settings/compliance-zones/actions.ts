"use server";

import { londonToday } from "@/lib/format";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, refresh, upsertRow } from "@/lib/settings/save";
import { parseComplianceZone } from "@/lib/settings/schemas";

const PATH = "/settings/compliance-zones";
const UNIQUE = {
  compliance_zones_name_key: { field: "name", message: "You already have a zone with this name." },
};

export async function saveComplianceZone(
  id: string | null,
  formData: FormData,
): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseComplianceZone(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    // Editing the data is checking it: the zone's "last updated" date moves to today.
    const result = await upsertRow(
      "compliance_zones",
      id,
      { ...parsed.data, data_updated_on: londonToday() },
      UNIQUE,
    );
    if (result.ok) {
      refresh(PATH);
      refresh("/plan");
    }
    return result;
  });
}

export async function deleteComplianceZone(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("compliance_zones", id);
    if (result.ok) {
      refresh(PATH);
      refresh("/plan");
    }
    return result;
  });
}
