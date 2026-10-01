import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "../../tests/support/local-supabase";

/** Test accounts are created through the admin API so tests don't depend on each other. */

export const PASSWORD = "correct-horse-battery";
const env = localSupabase();
const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const service = createClient(env.apiUrl, env.secretKey, options);

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function createAccount(fullName: string, email = uniqueEmail("user")) {
  const { error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  const client = createClient(env.apiUrl, env.publishableKey, options);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { email, client };
}

/** A company with an admin, plus members who joined by invitation. */
export async function createCompany(
  name: string,
  adminName: string,
  members: { name: string; role: "planner" | "warehouse" | "driver" | "office" }[] = [],
) {
  const admin = await createAccount(adminName, uniqueEmail("admin"));
  const { error } = await admin.client.rpc("create_organisation", { organisation_name: name });
  if (error) throw error;
  const created: Record<string, string> = {};
  for (const m of members) {
    const user = await createAccount(m.name, uniqueEmail(m.role));
    const { data, error: inviteError } = await admin.client
      .rpc("create_invitation", { invite_email: user.email, invite_role: m.role })
      .single<{ token: string }>();
    if (inviteError) throw inviteError;
    const { error: acceptError } = await user.client.rpc("accept_invitation", {
      invite_token: data.token,
    });
    if (acceptError) throw acceptError;
    created[m.role] = user.email;
  }
  return { adminEmail: admin.email, members: created };
}
