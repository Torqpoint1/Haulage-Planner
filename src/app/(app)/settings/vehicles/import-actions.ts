"use server";

import { revalidatePath } from "next/cache";
import type { ImportPreview } from "@/components/import/import-wizard";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import type { CsvTable } from "@/lib/csv";
import { checkImportTable, type FieldMapping, type ImportProblem } from "@/lib/import/mapping";
import { createClient } from "@/lib/supabase/server";
import { planVehicleImport, VEHICLE_IMPORT_FIELDS } from "@/lib/vehicles/import";

type Fail = { ok: false; error: string };

async function guarded<T>(run: () => Promise<T | Fail>): Promise<T | Fail> {
  try {
    await requireCapability("settings.manage");
    return await run();
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

async function planFor(table: CsvTable, mapping: FieldMapping) {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("registration");
  return {
    supabase,
    plan: planVehicleImport(
      table,
      mapping,
      (data ?? []).map((v) => v.registration as string),
    ),
  };
}

/** Check every row on the server and say what would happen. */
export async function previewVehicleImport(
  table: CsvTable,
  mapping: FieldMapping,
): Promise<{ ok: true; preview: ImportPreview } | Fail> {
  return guarded(async () => {
    const problem = checkImportTable(table.rows.length, VEHICLE_IMPORT_FIELDS, mapping);
    if (problem) return { ok: false, error: problem };
    const { plan } = await planFor(table, mapping);
    return {
      ok: true as const,
      preview: { rowCount: plan.rowCount, count: plan.vehicles.length, rejected: plan.rejected },
    };
  });
}

/** Add the valid vehicles (re-checked now) in one insert: all or nothing. */
export async function runVehicleImport(
  table: CsvTable,
  mapping: FieldMapping,
): Promise<{ ok: true; imported: number; rejected: ImportProblem[] } | Fail> {
  return guarded(async () => {
    const problem = checkImportTable(table.rows.length, VEHICLE_IMPORT_FIELDS, mapping);
    if (problem) return { ok: false, error: problem };
    const { supabase, plan } = await planFor(table, mapping);
    await supabase
      .from("csv_import_mappings")
      .upsert({ import_type: "vehicles", mapping }, { onConflict: "organisation_id,import_type" });
    if (plan.vehicles.length) {
      const { error } = await supabase.from("vehicles").insert(plan.vehicles);
      if (error) {
        console.error("vehicle import failed", error);
        return {
          ok: false,
          error:
            error.code === "23505"
              ? "Nothing was imported because a registration was added by someone else meanwhile. Check again."
              : "Nothing was imported because something went wrong. Try again.",
        };
      }
    }
    revalidatePath("/settings/vehicles");
    return { ok: true as const, imported: plan.vehicles.length, rejected: plan.rejected };
  });
}
