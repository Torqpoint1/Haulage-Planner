import "server-only";
import { createClient } from "@/lib/supabase/server";

export const LOGO_BUCKET = "organisation-files";
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;

/** A short-lived link to the organisation's logo, or null if there isn't one. */
export async function logoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
