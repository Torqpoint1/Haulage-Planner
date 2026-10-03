import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { formatIsoDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ComplianceZonesManager, type ComplianceZone } from "./compliance-zones-manager";

export const metadata: Metadata = { title: "Compliance zones" };

export default async function ComplianceZonesPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("compliance_zones").select("*").order("name");
  const rows = (data ?? []) as ComplianceZone[];
  const oldest = rows.map((z) => z.data_updated_on).sort()[0];
  return (
    <PageContainer>
      <SettingsHeader
        title="Compliance zones"
        description={
          <>
            London and clean air zone rules, checked against each stop&apos;s postcode.
            {oldest ? (
              <>
                {" "}
                Data last updated{" "}
                <span className="num font-medium text-text">{formatIsoDate(oldest)}</span>; check it
                against the current schemes.
              </>
            ) : null}
          </>
        }
      />
      <ComplianceZonesManager rows={rows} />
    </PageContainer>
  );
}
