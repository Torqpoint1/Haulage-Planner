import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { logoUrl } from "@/lib/branding";
import { OrganisationForm } from "./organisation-form";

export const metadata: Metadata = { title: "Organisation & branding" };

export default async function OrganisationPage() {
  const session = await requireArea("settings");
  const org = session.membership.organisation;
  return (
    <PageContainer>
      <SettingsHeader
        title="Organisation & branding"
        description="Your company's name, logo and colour, as your team sees them."
      />
      <OrganisationForm
        orgId={org.id}
        name={org.name}
        accentColour={org.accentColour}
        logoUrl={await logoUrl(org.logoPath)}
      />
    </PageContainer>
  );
}
