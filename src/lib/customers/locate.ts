import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupPostcode, type PostcodeLocation } from "@/lib/services/postcodes";

/**
 * Find a postcode's position: the organisation's cache first, then the lookup
 * service (spec 4). Returns null when the postcode is unknown or the service
 * is down; callers save anyway and show that the pin is missing.
 */
export async function locatePostcode(
  supabase: SupabaseClient,
  postcode: string,
): Promise<PostcodeLocation | null> {
  const { data: cached } = await supabase
    .from("postcode_lookups")
    .select("latitude, longitude, district")
    .eq("postcode", postcode)
    .maybeSingle();
  if (cached) return cached as PostcodeLocation;

  const found = await lookupPostcode(postcode);
  if (found) {
    await supabase
      .from("postcode_lookups")
      .upsert({ postcode, ...found }, { onConflict: "organisation_id,postcode" });
  }
  return found;
}
