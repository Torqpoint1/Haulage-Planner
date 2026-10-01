"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { friendlyError } from "@/lib/auth/errors";
import { changeRoleSchema, fieldErrors, inviteSchema } from "@/lib/auth/schemas";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };

const PATH = "/settings/users";

/** Every action re-checks the role on the server; RLS checks it again in the database. */
async function guarded<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requireCapability("users.manage");
    return await run();
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function inviteMember(input: {
  email: string;
  role: string;
}): Promise<ActionResult<{ link: string }>> {
  return guarded<{ link: string }>(async () => {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: "Check the highlighted fields.",
        fieldErrors: fieldErrors(parsed.error),
      };

    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("create_invitation", { invite_email: parsed.data.email, invite_role: parsed.data.role })
      .single<{ invitation_id: string; token: string }>();
    if (error || !data) return { ok: false, error: friendlyError(error) };

    revalidatePath(PATH);
    return { ok: true, link: `${await siteOrigin()}/invite/${data.token}` };
  });
}

export async function changeRole(input: {
  membershipId: string;
  role: string;
}): Promise<ActionResult> {
  return guarded<object>(async () => {
    const parsed = changeRoleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Choose a valid role." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("memberships")
      .update({ role: parsed.data.role })
      .eq("id", parsed.data.membershipId)
      .select("id");
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data?.length) return { ok: false, error: "That person is no longer a member." };

    revalidatePath(PATH);
    return { ok: true };
  });
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  return guarded<object>(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .select("id");
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data?.length) return { ok: false, error: "That person is no longer a member." };
    revalidatePath(PATH);
    return { ok: true };
  });
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  return guarded<object>(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_invitation", {
      target_invitation_id: invitationId,
    });
    if (error)
      return {
        ok: false,
        error: friendlyError(error, "That invitation has already been used or cancelled."),
      };
    revalidatePath(PATH);
    return { ok: true };
  });
}
