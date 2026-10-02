import "server-only";
import { revalidatePath } from "next/cache";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DeleteResult, FormState } from "./result";

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null;

/** Unique-index name fragment → the field it concerns and a plain-English message. */
export type UniqueMessages = Record<string, { field: string; message: string }>;

/** Turn a database error into something a person can act on (spec 10.6). */
export function describeDbError(error: DbError, unique: UniqueMessages = {}): FormState {
  if (!error) return { ok: false, error: "Something went wrong. Try again." };
  if (error.code === "23505") {
    const hit = Object.entries(unique).find(([fragment]) =>
      `${error.message} ${error.details}`.includes(fragment),
    );
    if (hit) return { ok: false, errors: { [hit[1].field]: hit[1].message } };
    return { ok: false, error: "Something with these details already exists." };
  }
  if (error.code === "23503") {
    return { ok: false, error: "This is still used elsewhere, so it can't be removed yet." };
  }
  if (error.code === "23514" || error.code === "22P02" || error.code === "23502") {
    return { ok: false, error: "Some values aren't allowed. Check the form and try again." };
  }
  if (error.code === "42501") return { ok: false, error: "You don't have permission to do that." };
  console.error("Settings save failed", error);
  return { ok: false, error: "Something went wrong. Try again." };
}

/** Runs a settings action for admins only; anything unexpected becomes a friendly error. */
export async function asAdmin<T extends FormState | DeleteResult>(
  run: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    await requireCapability("settings.manage");
    return await run();
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, error: error.message };
    // Next uses thrown errors for redirects; let those through.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** Insert (id null) or update a row, through RLS as the signed-in admin. */
export async function upsertRow(
  table: string,
  id: string | null,
  row: Record<string, unknown>,
  unique: UniqueMessages = {},
): Promise<FormState> {
  const supabase = await createClient();
  const query = id
    ? supabase.from(table).update(row).eq("id", id).select("id")
    : supabase.from(table).insert(row).select("id");
  const { data, error } = await query;
  if (error) return describeDbError(error, unique);
  if (!data?.length)
    return { ok: false, error: "This has been removed, or you no longer have access." };
  return { ok: true, id: data[0].id as string };
}

export async function deleteRow(table: string, id: string): Promise<DeleteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return describeDbError(error) as DeleteResult;
  if (!data?.length) return { ok: false, error: "This has already been removed." };
  return { ok: true };
}

export function refresh(path: string) {
  revalidatePath(path);
  revalidatePath("/settings");
}
