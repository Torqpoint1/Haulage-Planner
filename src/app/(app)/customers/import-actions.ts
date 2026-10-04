"use server";

import { revalidatePath } from "next/cache";
import type { ImportPreview } from "@/components/import/import-wizard";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import type { CsvTable } from "@/lib/csv";
import { CUSTOMER_IMPORT_FIELDS, planCustomerImport } from "@/lib/customers/import";
import { locatePostcode } from "@/lib/customers/locate";
import { checkImportTable, type FieldMapping, type ImportProblem } from "@/lib/import/mapping";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string };

async function guarded<T>(run: () => Promise<T | Fail>): Promise<T | Fail> {
  try {
    await requireCapability("customers.edit");
    return await run();
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

async function planFor(table: CsvTable, mapping: FieldMapping) {
  const supabase = await createClient();
  const [customers, sites] = await Promise.all([
    supabase.from("customers").select("id, name, account_ref"),
    supabase.from("sites").select("customer_id, name, postcode"),
  ]);
  return {
    supabase,
    plan: planCustomerImport(table, mapping, {
      customers: customers.data ?? [],
      sites: sites.data ?? [],
    }),
  };
}

/** Check every row on the server and say what would happen. */
export async function previewCustomerImport(
  table: CsvTable,
  mapping: FieldMapping,
): Promise<{ ok: true; preview: ImportPreview } | Fail> {
  return guarded(async () => {
    const problem = checkImportTable(table.rows.length, CUSTOMER_IMPORT_FIELDS, mapping);
    if (problem) return { ok: false, error: problem };
    const { plan } = await planFor(table, mapping);
    return {
      ok: true as const,
      preview: {
        rowCount: plan.rowCount,
        count: plan.siteCount,
        extra: { label: "New customers", value: plan.newCustomers },
        rejected: plan.rejected,
      },
    };
  });
}

/**
 * Import the valid sites (re-checked now), placing each on the map from its
 * postcode (spec 11: postcodes are looked up during import). A postcode the
 * lookup can't find still imports, without a pin.
 */
export async function runCustomerImport(
  table: CsvTable,
  mapping: FieldMapping,
): Promise<{ ok: true; imported: number; rejected: ImportProblem[] } | Fail> {
  return guarded(async () => {
    const problem = checkImportTable(table.rows.length, CUSTOMER_IMPORT_FIELDS, mapping);
    if (problem) return { ok: false, error: problem };
    const { supabase, plan } = await planFor(table, mapping);

    const postcodes = [...new Set(plan.customers.flatMap((c) => c.sites.map((s) => s.postcode)))];
    const located = new Map<string, { latitude: number; longitude: number } | null>();
    for (let i = 0; i < postcodes.length; i += 5) {
      await Promise.all(
        postcodes
          .slice(i, i + 5)
          .map(async (p) => located.set(p, await locatePostcode(supabase, p))),
      );
    }

    await supabase
      .from("csv_import_mappings")
      .upsert({ import_type: "customers", mapping }, { onConflict: "organisation_id,import_type" });

    let imported = 0;
    for (let i = 0; i < plan.customers.length; i += 100) {
      const batch = plan.customers.slice(i, i + 100).map((c) => ({
        existing_id: c.existingId,
        name: c.name,
        account_ref: c.account_ref,
        sites: c.sites.map((s) => ({
          ...s,
          latitude: located.get(s.postcode)?.latitude ?? null,
          longitude: located.get(s.postcode)?.longitude ?? null,
        })),
      }));
      const { data, error } = await supabase.rpc("import_customers", { customers: batch });
      if (error) {
        console.error("import_customers failed", error);
        return {
          ok: false,
          error:
            imported > 0
              ? `${imported} sites were imported, then something went wrong. Check the Customers list, then import the rest again.`
              : error.code === "P0002"
                ? error.message
                : "Nothing was imported because something went wrong. Try again.",
        };
      }
      imported += data as number;
    }
    revalidatePath("/customers", "layout");
    return { ok: true as const, imported, rejected: plan.rejected };
  });
}
