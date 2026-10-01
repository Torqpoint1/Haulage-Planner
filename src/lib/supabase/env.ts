/**
 * Supabase connection settings. Only the publishable key is ever exposed to
 * the browser; Row Level Security does the protecting (spec 5, 12).
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see `npx supabase status` for local values).",
    );
  }
  return { url, key };
}
