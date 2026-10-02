import { AppShell } from "@/components/shell/app-shell";
import { requireMember } from "@/lib/auth/session";
import { logoUrl } from "@/lib/branding";
import { accentCss } from "@/lib/color";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMember();
  const org = session.membership.organisation;
  return (
    <>
      {/* The organisation's accent colour, adjusted for contrast, applied app-wide (spec 10.3). */}
      <style
        id="org-accent-live"
        dangerouslySetInnerHTML={{ __html: accentCss(org.accentColour) }}
      />
      <AppShell
        orgName={org.name}
        logoUrl={await logoUrl(org.logoPath)}
        userName={session.fullName}
        email={session.email}
        role={session.membership.role}
      >
        {children}
      </AppShell>
    </>
  );
}
