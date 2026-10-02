import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UnitTypesManager, type UnitType } from "./unit-types-manager";

export const metadata: Metadata = { title: "Handling unit types" };

export default async function UnitTypesPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("unit_types").select("*").order("name");
  return (
    <PageContainer>
      <SettingsHeader
        title="Handling unit types"
        description="What you move: pallets, stillages, door packs and so on, and how each must travel."
      />
      <UnitTypesManager rows={(data ?? []) as UnitType[]} />
    </PageContainer>
  );
}
