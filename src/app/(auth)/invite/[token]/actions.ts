"use server";

import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/errors";
import { homePath } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvitation(token: string): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error) return { error: friendlyError(error) };
  const session = await getSession();
  redirect(session?.membership ? homePath(session.membership.role) : "/");
}
