"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CsvTable } from "@/lib/csv";
import {
  MAX_IMPORT_ROWS,
  missingRequired,
  planOrderImport,
  type ImportPlan,
  type Mapping,
} from "@/lib/orders/import";
import { READINESS } from "@/lib/orders/options";
import { parseOrder } from "@/lib/orders/schemas";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

/** Planners and admins edit orders (spec 3); RLS enforces the same. */
const edit = <T extends FormState | DeleteResult>(run: () => Promise<T>) =>
  withCapability("orders.edit", run);

const refresh = (id?: string) => {
  revalidatePath("/orders");
  if (id) revalidatePath(`/orders/${id}`);
};

const UNIQUE = {
  orders_ref_key: { field: "order_ref", message: "Another order already has this ref." },
};

export async function saveOrder(id: string | null, formData: FormData): Promise<FormState> {
  return edit(async () => {
    const parsed = parseOrder(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_order", {
      target_order_id: id,
      order_data: parsed.data.order,
      lines: parsed.data.lines,
    });
    if (error) {
      if (error.code === "23503") {
        return {
          ok: false,
          error: "That customer, site or unit type no longer exists. Reload and try again.",
        };
      }
      if (error.code === "P0002") return { ok: false, error: "This order has been deleted." };
      return describeDbError(error, UNIQUE);
    }
    refresh(data as string);
    return { ok: true, id: data as string };
  });
}

const readinessSchema = z.object({
  readiness: z.enum(READINESS.map((r) => r.value) as [string, ...string[]]),
  missing_items: z.string().max(1000),
  expected_ready_date: z.iso.date().nullable(),
});

export async function updateReadiness(
  orderId: string,
  input: { readiness: string; missing_items: string; expected_ready_date: string | null },
): Promise<DeleteResult> {
  return edit(async () => {
    const parsed = readinessSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Choose a readiness and a valid date." };
    const ready = parsed.data.readiness === "ready";
    if (!ready && parsed.data.readiness !== "not_started" && !parsed.data.expected_ready_date) {
      return { ok: false, error: "Enter when it's expected to be ready." };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .update({
        readiness: parsed.data.readiness,
        missing_items: ready ? "" : parsed.data.missing_items.trim(),
        expected_ready_date: ready ? null : parsed.data.expected_ready_date,
      })
      .eq("id", orderId)
      .select("id");
    if (error) return describeDbError(error) as DeleteResult;
    if (!data?.length) return { ok: false, error: "This order has been deleted." };
    refresh(orderId);
    return { ok: true };
  });
}

export async function setOrderCancelled(
  orderId: string,
  cancelled: boolean,
): Promise<DeleteResult> {
  return edit(async () => {
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle();
    if (!current) return { ok: false, error: "This order has been deleted." };
    if (cancelled && !["unplanned", "planned"].includes(current.status)) {
      return { ok: false, error: "Only orders that haven't been loaded can be cancelled." };
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: cancelled ? "cancelled" : "unplanned" })
      .eq("id", orderId);
    if (error) return describeDbError(error) as DeleteResult;
    refresh(orderId);
    return { ok: true };
  });
}

export async function deleteOrder(orderId: string): Promise<DeleteResult> {
  return edit(async () => {
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("orders")
      .select("status, attachments:order_attachments(storage_path)")
      .eq("id", orderId)
      .maybeSingle();
    if (!current) return { ok: false, error: "This order has already been deleted." };
    if (!["unplanned", "cancelled"].includes(current.status)) {
      return {
        ok: false,
        error: "Planned or delivered orders can't be deleted; cancel them instead.",
      };
    }
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) return describeDbError(error) as DeleteResult;
    const paths = (current.attachments as { storage_path: string }[]).map((a) => a.storage_path);
    if (paths.length) await supabase.storage.from("organisation-files").remove(paths);
    refresh();
    return { ok: true };
  });
}

const attachmentSchema = z.object({
  orderId: z.uuid(),
  path: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
  contentType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]),
  size: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
});

/** Record a document the browser has uploaded to "<org>/orders/<order>/…". */
export async function addAttachment(
  input: z.input<typeof attachmentSchema>,
): Promise<DeleteResult> {
  return edit(async () => {
    const parsed = attachmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "That file couldn't be added. Try again." };
    const supabase = await createClient();
    const { error } = await supabase.from("order_attachments").insert({
      order_id: parsed.data.orderId,
      storage_path: parsed.data.path,
      file_name: parsed.data.fileName,
      content_type: parsed.data.contentType,
      size_bytes: parsed.data.size,
    });
    if (error) {
      await supabase.storage.from("organisation-files").remove([parsed.data.path]);
      return describeDbError(error) as DeleteResult;
    }
    refresh(parsed.data.orderId);
    return { ok: true };
  });
}

export async function deleteAttachment(attachmentId: string): Promise<DeleteResult> {
  return edit(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("order_attachments")
      .delete()
      .eq("id", attachmentId)
      .select("storage_path, order_id");
    if (error) return describeDbError(error) as DeleteResult;
    if (!data?.length) return { ok: false, error: "That document has already been removed." };
    await supabase.storage.from("organisation-files").remove([data[0].storage_path]);
    refresh(data[0].order_id);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// CSV import (spec 11)
// ---------------------------------------------------------------------------

async function importLookups() {
  const supabase = await createClient();
  const [customers, sites, unitTypes, refs] = await Promise.all([
    supabase.from("customers").select("id, name, account_ref"),
    supabase.from("sites").select("id, customer_id, name, postcode, delivery_instructions"),
    supabase.from("unit_types").select("id, name, short_code, typical_weight_kg"),
    supabase.from("orders").select("order_ref"),
  ]);
  return {
    supabase,
    lookups: {
      customers: customers.data ?? [],
      sites: sites.data ?? [],
      unitTypes: (unitTypes.data ?? []).map((u) => ({
        ...u,
        typical_weight_kg: Number(u.typical_weight_kg),
      })),
      existingRefs: new Set((refs.data ?? []).map((r) => r.order_ref.toLowerCase())),
    },
  };
}

type PreviewResult =
  | {
      ok: true;
      plan: Pick<ImportPlan, "rejected" | "lineCount"> & { orderCount: number; rowCount: number };
    }
  | { ok: false; error: string };

function checkTable(table: CsvTable, mapping: Mapping): string | null {
  if (!table.rows.length) return "That file has no rows under the header.";
  if (table.rows.length > MAX_IMPORT_ROWS) {
    return `That file has ${table.rows.length.toLocaleString("en-GB")} rows. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString("en-GB")} or fewer.`;
  }
  const missing = missingRequired(mapping);
  if (missing.length) return `Choose a column for ${missing.join(", ")}.`;
  return null;
}

/** Check every row on the server (the authority) and say what would happen. */
export async function previewOrderImport(
  table: CsvTable,
  mapping: Mapping,
): Promise<PreviewResult> {
  const result = await edit(async () => {
    const problem = checkTable(table, mapping);
    if (problem) return { ok: false as const, error: problem };
    const { lookups } = await importLookups();
    const plan = planOrderImport(table, mapping, lookups);
    return {
      ok: true as const,
      plan: {
        rejected: plan.rejected,
        lineCount: plan.lineCount,
        orderCount: plan.orders.length,
        rowCount: plan.rows.length,
      },
    };
  });
  return result as PreviewResult;
}

/** Import the valid orders (re-checked now, in case anything changed) and remember the mapping. */
export async function runOrderImport(
  table: CsvTable,
  mapping: Mapping,
): Promise<
  { ok: true; imported: number; rejected: ImportPlan["rejected"] } | { ok: false; error: string }
> {
  const result = await edit(async () => {
    const problem = checkTable(table, mapping);
    if (problem) return { ok: false as const, error: problem };
    const { supabase, lookups } = await importLookups();
    const plan = planOrderImport(table, mapping, lookups);

    await supabase
      .from("csv_import_mappings")
      .upsert({ import_type: "orders", mapping }, { onConflict: "organisation_id,import_type" });

    let imported = 0;
    for (let i = 0; i < plan.orders.length; i += 100) {
      const batch = plan.orders.slice(i, i + 100).map((o) => ({ order: o.order, lines: o.lines }));
      const { data, error } = await supabase.rpc("import_orders", { orders: batch });
      if (error) {
        console.error("import_orders failed", error);
        return {
          ok: false as const,
          error:
            imported > 0
              ? `${imported} orders were imported, then something went wrong. Check the Orders list, then import the rest again.`
              : "Nothing was imported because something went wrong. Try again.",
        };
      }
      imported += data as number;
    }
    refresh();
    return { ok: true as const, imported, rejected: plan.rejected };
  });
  return result as Awaited<ReturnType<typeof runOrderImport>>;
}
