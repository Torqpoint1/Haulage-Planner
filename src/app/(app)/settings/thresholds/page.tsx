import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { resolveThresholds } from "@/lib/settings/thresholds";
import { createClient } from "@/lib/supabase/server";
import { ThresholdsForm } from "./thresholds-form";

export const metadata: Metadata = { title: "Warning thresholds" };

export default async function ThresholdsPage() {
  const session = await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase
    .from("organisations")
    .select("warning_thresholds, site_info_stale_days")
    .eq("id", session.membership.organisation.id)
    .single();
  return (
    <PageContainer>
      <SettingsHeader
        title="Warning thresholds"
        description="When checks turn amber, when they block a load, and how far ahead suggestions look."
      />
      <ThresholdsForm
        values={resolveThresholds(data?.warning_thresholds)}
        siteStaleDays={data?.site_info_stale_days ?? 180}
      />
    </PageContainer>
  );
}
