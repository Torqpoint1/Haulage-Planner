import { CircleAlert, MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_INFO, homePath, type Role } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitation, SignOutButton } from "./accept-invitation";

export const metadata: Metadata = { title: "Invitation" };

type Invitation = { organisation_name: string; email: string; role: Role; status: string };

const STATUS_MESSAGES: Record<string, { title: string; description: string }> = {
  accepted: {
    title: "Invitation already used",
    description: "This invitation has been accepted. Sign in to carry on.",
  },
  revoked: {
    title: "Invitation cancelled",
    description: "This invitation was cancelled. Ask your administrator for a new one.",
  },
  expired: {
    title: "Invitation expired",
    description: "Invitations last 14 days. Ask your administrator to send a new one.",
  },
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation", { invite_token: token });
  const invitation = (data as Invitation[] | null)?.[0];

  if (!invitation) {
    return (
      <EmptyState
        compact
        icon={MailX}
        title="Invitation not found"
        description="Check you copied the whole link. If it still doesn't work, ask for a new invitation."
        action={
          <Button asChild>
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        }
      />
    );
  }

  if (invitation.status !== "open") {
    const message = STATUS_MESSAGES[invitation.status];
    return (
      <EmptyState
        compact
        icon={CircleAlert}
        title={message.title}
        description={message.description}
        action={
          <Button asChild>
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        }
      />
    );
  }

  const role = ROLE_INFO[invitation.role];
  const heading = (
    <AuthHeading
      title={`Join ${invitation.organisation_name}`}
      description={
        <>
          You&apos;ve been invited as{" "}
          <strong className="font-semibold text-text">{role.label}</strong>:{" "}
          {role.description.charAt(0).toLowerCase() + role.description.slice(1)}
        </>
      }
    />
  );

  const session = await getSession();
  const next = `/invite/${token}`;

  if (!session) {
    const email = encodeURIComponent(invitation.email);
    return (
      <>
        {heading}
        <p className="mb-6 text-sm text-text-muted">
          Create an account or sign in with{" "}
          <strong className="font-medium text-text">{invitation.email}</strong> to accept.
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild variant="primary" size="lg">
            <Link href={`/sign-up?next=${encodeURIComponent(next)}&email=${email}`}>
              Create account
            </Link>
          </Button>
          <Button asChild size="lg">
            <Link href={`/sign-in?next=${encodeURIComponent(next)}&email=${email}`}>Sign in</Link>
          </Button>
        </div>
      </>
    );
  }

  if (session.membership) {
    return (
      <EmptyState
        compact
        icon={CircleAlert}
        title="You already belong to a company"
        description={`You're a member of ${session.membership.organisation.name}. Each account can belong to one company.`}
        action={
          <Button asChild>
            <Link href={homePath(session.membership.role)}>
              Go to {session.membership.organisation.name}
            </Link>
          </Button>
        }
      />
    );
  }

  if (session.email !== invitation.email) {
    return (
      <>
        {heading}
        <p className="mb-6 text-sm text-text-muted">
          This invitation is for{" "}
          <strong className="font-medium text-text">{invitation.email}</strong>, but you&apos;re
          signed in as <strong className="font-medium text-text">{session.email}</strong>. Sign out
          and use the invited address.
        </p>
        <SignOutButton next={next} />
      </>
    );
  }

  return (
    <>
      {heading}
      <AcceptInvitation token={token} />
    </>
  );
}
