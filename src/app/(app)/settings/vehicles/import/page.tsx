import type { Metadata } from "next";
import { ImportWizard } from "@/components/import/import-wizard";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import type { FieldMapping } from "@/lib/import/mapping";
import { createClient } from "@/lib/supabase/server";
import { vehicleImportCopy } from "@/lib/vehicles/import";
import { previewVehicleImport, runVehicleImport } from "../import-actions";

export const metadata: Metadata = { title: "Import vehicles" };

export default async function ImportVehiclesPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const { data } = await supabase
    .from("csv_import_mappings")
    .select("mapping")
    .eq("import_type", "vehicles")
    .maybeSingle();
  return (
    <PageContainer>
      <SettingsHeader
        title="Import vehicles"
        backHref="/settings/vehicles"
        backLabel="Vehicles"
        description="Upload a CSV of your fleet. Each row is checked like the vehicle form. Nothing is saved until you've checked it."
      />
      <ImportWizard
        copy={vehicleImportCopy()}
        remembered={(data?.mapping ?? {}) as FieldMapping}
        preview={previewVehicleImport}
        run={runVehicleImport}
      />
    </PageContainer>
  );
}
