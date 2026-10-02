import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ZonesManager, type Zone } from "./zones-manager";

export const metadata: Metadata = { title: "Postcode zones" };

export default async function ZonesPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("postcode_zones").select("*").order("name");
  return (
    <PageContainer>
      <SettingsHeader
        title="Postcode zones"
        description="Groups of postcode areas, used for haulier rate cards and planning colours."
      />
      <ZonesManager rows={(data ?? []) as Zone[]} />
    </PageContainer>
  );
}
