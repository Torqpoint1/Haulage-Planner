import { execSync } from "node:child_process";

export type LocalSupabase = {
  apiUrl: string;
  dbUrl: string;
  publishableKey: string;
  secretKey: string;
};

let cached: LocalSupabase | null = null;

/**
 * Connection details for the local Supabase started with `npx supabase start`.
 * These are fixed development values, never production credentials.
 */
export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let raw: string;
  try {
    raw = execSync("npx supabase status -o json", {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npx supabase start`.");
  }
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string>;
  cached = {
    apiUrl: status.API_URL,
    dbUrl: status.DB_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
  };
  return cached;
}
