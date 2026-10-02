import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { can, canAccess, isRole, type Area, type Capability, type Role } from "./roles";

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  membership: {
    role: Role;
    organisation: { id: string; name: string; accentColour: string; logoPath: string | null };
  } | null;
};

export type MemberSession = Session & { membership: NonNullable<Session["membership"]> };

/**
 * The signed-in user, their organisation and role, read once per request.
 * Identity comes from a verified token (getClaims), never from cookies alone.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", claims.sub).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, organisation:organisations(id, name, accent_colour, logo_path)")
      .eq("user_id", claims.sub)
      .maybeSingle(),
  ]);

  const email = profile?.email ?? (typeof claims.email === "string" ? claims.email : "");
  const org = membership?.organisation as unknown as {
    id: string;
    name: string;
    accent_colour: string;
    logo_path: string | null;
  } | null;

  return {
    userId: claims.sub,
    email,
    fullName: profile?.full_name || email,
    membership:
      membership && org && isRole(membership.role)
        ? {
            role: membership.role,
            organisation: {
              id: org.id,
              name: org.name,
              accentColour: org.accent_colour,
              logoPath: org.logo_path,
            },
          }
        : null,
  };
});

/** Signed in, with or without an organisation (e.g. onboarding). */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Signed in and a member of an organisation. */
export async function requireMember(): Promise<MemberSession> {
  const session = await requireUser();
  if (!session.membership) redirect("/onboarding");
  return session as MemberSession;
}

/** For pages: sends people without access to a plain-English explanation. */
export async function requireArea(area: Area): Promise<MemberSession> {
  const session = await requireMember();
  if (!canAccess(session.membership.role, area)) redirect("/no-access");
  return session;
}

export class NotAllowedError extends Error {
  constructor() {
    super("You don't have permission to do that.");
    this.name = "NotAllowedError";
  }
}

/** For server actions: checked on the server whatever the interface showed. */
export async function requireCapability(capability: Capability): Promise<MemberSession> {
  const session = await getSession();
  if (!session?.membership || !can(session.membership.role, capability))
    throw new NotAllowedError();
  return session as MemberSession;
}
