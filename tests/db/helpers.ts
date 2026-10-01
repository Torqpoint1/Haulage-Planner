import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { localSupabase } from "../support/local-supabase";

export type Role = "admin" | "planner" | "warehouse" | "driver" | "office";

const env = localSupabase();
const PASSWORD = "correct-horse-battery";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Bypasses RLS. Only for arranging and checking test data, never for assertions about access. */
export const service = createClient(env.apiUrl, env.secretKey, clientOptions);

/** Not signed in. */
export function anonymous(): SupabaseClient {
  return createClient(env.apiUrl, env.publishableKey, clientOptions);
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: env.dbUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

export type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient;
};

/** Create a confirmed user and return a client signed in as them. */
export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;
  const client = createClient(env.apiUrl, env.publishableKey, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export type TestOrg = {
  id: string;
  admin: TestUser;
  members: Partial<Record<Role, TestUser>>;
};

/** An organisation created through the real API, with members who joined by invitation. */
export async function createOrg(
  label: string,
  roles: Exclude<Role, "admin">[] = [],
): Promise<TestOrg> {
  const admin = await createUser(`${label}-admin`);
  const { data: orgId, error } = await admin.client.rpc("create_organisation", {
    organisation_name: `${label} Ltd`,
  });
  if (error) throw error;

  const members: TestOrg["members"] = { admin };
  for (const role of roles) {
    const user = await createUser(`${label}-${role}`);
    const { data: invite, error: inviteError } = await admin.client
      .rpc("create_invitation", { invite_email: user.email, invite_role: role })
      .single<{ invitation_id: string; token: string }>();
    if (inviteError) throw inviteError;
    const { error: acceptError } = await user.client.rpc("accept_invitation", {
      invite_token: invite.token,
    });
    if (acceptError) throw acceptError;
    members[role] = user;
  }
  return { id: orgId as string, admin, members };
}

export function member(org: TestOrg, role: Role): TestUser {
  const user = org.members[role];
  if (!user) throw new Error(`No ${role} in this test organisation`);
  return user;
}
