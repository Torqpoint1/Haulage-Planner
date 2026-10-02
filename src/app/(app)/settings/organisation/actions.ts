"use server";

import { revalidatePath } from "next/cache";
import { LOGO_BUCKET } from "@/lib/branding";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, describeDbError } from "@/lib/settings/save";
import { parseOrganisation } from "@/lib/settings/schemas";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

async function orgId() {
  const session = await getSession();
  return session?.membership?.organisation.id ?? null;
}

export async function saveOrganisation(_id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseOrganisation(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const id = await orgId();
    const supabase = await createClient();
    const { error } = await supabase.from("organisations").update(parsed.data).eq("id", id!);
    if (error) return describeDbError(error);
    // The accent colour and name appear on every page.
    revalidatePath("/", "layout");
    return { ok: true, id: id! };
  });
}

/** Record a logo the browser has just uploaded to "<org>/branding/…", and remove the old one. */
export async function setLogo(path: string | null): Promise<DeleteResult> {
  return asAdmin(async () => {
    const id = await orgId();
    if (path !== null && !new RegExp(`^${id}/branding/logo-\\d+\\.(png|jpg|webp)$`).test(path)) {
      return { ok: false, error: "That upload didn't work. Try again." };
    }
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("organisations")
      .select("logo_path")
      .eq("id", id!)
      .single();
    const { error } = await supabase
      .from("organisations")
      .update({ logo_path: path })
      .eq("id", id!);
    if (error) return describeDbError(error) as DeleteResult;
    if (current?.logo_path && current.logo_path !== path) {
      await supabase.storage.from(LOGO_BUCKET).remove([current.logo_path]);
    }
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
