import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { HauliersManager, type Haulier } from "./hauliers-manager";

export const metadata: Metadata = { title: "Hauliers & rate cards" };

export default async function HauliersPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("hauliers").select("*, rate_cards(count)").order("name");
  const rows = (data ?? []).map((h) => ({
    ...h,
    rate_card_count: (h.rate_cards as unknown as { count: number }[])[0]?.count ?? 0,
  })) as Haulier[];
  return (
    <PageContainer>
      <SettingsHeader
        title="Hauliers & rate cards"
        description="Outside hauliers, pallet networks and couriers, and what they charge."
      />
      <HauliersManager rows={rows} />
    </PageContainer>
  );
}
