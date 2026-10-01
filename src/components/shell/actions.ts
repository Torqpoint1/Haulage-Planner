"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function signOut(next?: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(next ? `/sign-in?next=${encodeURIComponent(safeNext(next))}` : "/sign-in");
}
