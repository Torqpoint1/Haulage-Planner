import { AppShell } from "@/components/shell/app-shell";
import { requireMember } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMember();
  return (
    <AppShell
      orgName={session.membership.organisation.name}
      userName={session.fullName}
      email={session.email}
      role={session.membership.role}
    >
      {children}
    </AppShell>
  );
}
