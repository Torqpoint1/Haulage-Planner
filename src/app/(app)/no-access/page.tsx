import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_INFO, homePath } from "@/lib/auth/roles";
import { requireMember } from "@/lib/auth/session";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage() {
  const session = await requireMember();
  const role = session.membership.role;
  return (
    <PageContainer>
      <EmptyState
        icon={Lock}
        title="You don't have access to that page"
        description={`Your role is ${ROLE_INFO[role].label}. If you need more access, ask an admin at ${session.membership.organisation.name}.`}
        action={
          <Button asChild variant="primary">
            <Link href={homePath(role)}>Go to your home page</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
