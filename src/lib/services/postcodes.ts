/**
 * Postcode lookup (spec 4: postcodes.io), behind a small module so the
 * provider can be swapped. Lookups never block saving: if the service is
 * slow or down, callers get null and the record is saved without a map
 * position (spec 12).
 */

export type PostcodeLocation = { latitude: number; longitude: number };

type Fetch = typeof fetch;

const BASE_URL = process.env.POSTCODES_API_URL ?? "https://api.postcodes.io";
const TIMEOUT_MS = 3000;

export async function lookupPostcode(
  postcode: string,
  fetchImpl: Fetch = fetch,
): Promise<PostcodeLocation | null> {
  try {
    const response = await fetchImpl(`${BASE_URL}/postcodes/${encodeURIComponent(postcode)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: { latitude?: number | null; longitude?: number | null } | null;
    };
    const { latitude, longitude } = body.result ?? {};
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
