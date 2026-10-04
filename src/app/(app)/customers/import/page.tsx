import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportWizard } from "@/components/import/import-wizard";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { customerImportCopy } from "@/lib/customers/import";
import type { FieldMapping } from "@/lib/import/mapping";
import { createClient } from "@/lib/supabase/server";
import { previewCustomerImport, runCustomerImport } from "../import-actions";

export const metadata: Metadata = { title: "Import customers" };

export default async function ImportCustomersPage() {
  const session = await requireArea("customers");
  if (!can(session.membership.role, "customers.edit")) redirect("/no-access");
  const supabase = await createClient();
  const { data } = await supabase
    .from("csv_import_mappings")
    .select("mapping")
    .eq("import_type", "customers")
    .maybeSingle();
  return (
    <PageContainer>
      <SettingsHeader
        title="Import customers and sites"
        backHref="/customers"
        backLabel="Customers"
        description="Upload a CSV of customers and their delivery sites. Postcodes are checked and placed on the map. Nothing is saved until you've checked it."
      />
      <ImportWizard
        copy={customerImportCopy()}
        remembered={(data?.mapping ?? {}) as FieldMapping}
        preview={previewCustomerImport}
        run={runCustomerImport}
      />
    </PageContainer>
  );
}
