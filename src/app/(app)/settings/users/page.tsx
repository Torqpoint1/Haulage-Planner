import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { isRole, type Role } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UsersManager, type Invitation, type Member } from "./users-manager";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const session = await requireArea("settings");
  const supabase = await createClient();

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, user_id, created_at, profile:profiles(full_name, email)")
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at, created_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const members: Member[] = (memberRows ?? []).map((row) => {
    const profile = row.profile as unknown as { full_name: string; email: string } | null;
    return {
      id: row.id,
      userId: row.user_id,
      role: (isRole(row.role) ? row.role : "office") as Role,
      name: profile?.full_name || profile?.email || "Unknown",
      email: profile?.email ?? "",
      joinedAt: row.created_at,
    };
  });

  const invitations: Invitation[] = (inviteRows ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: (isRole(row.role) ? row.role : "office") as Role,
    expiresAt: row.expires_at,
  }));

  return (
    <PageContainer className="gap-4">
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="size-icon-sm" aria-hidden />
        Settings
      </Link>
      <PageHeader
        title="Users & roles"
        description={`Who can use ${session.membership.organisation.name}, and what they can do.`}
      />
      <UsersManager members={members} invitations={invitations} currentUserId={session.userId} />
    </PageContainer>
  );
}
