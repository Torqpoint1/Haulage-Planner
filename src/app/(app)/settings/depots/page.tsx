import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DepotsManager, type Depot } from "./depots-manager";

export const metadata: Metadata = { title: "Depots" };

export default async function DepotsPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("depots").select("*").order("name");
  return (
    <PageContainer>
      <SettingsHeader
        title="Depots"
        description="Where your loads start: factories, warehouses and yards."
      />
      <DepotsManager rows={(data ?? []) as Depot[]} />
    </PageContainer>
  );
}
