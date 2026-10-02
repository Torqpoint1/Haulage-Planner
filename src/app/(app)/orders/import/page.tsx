import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import type { Mapping } from "@/lib/orders/import";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import orders" };

export default async function ImportOrdersPage() {
  const session = await requireArea("orders");
  if (!can(session.membership.role, "orders.edit")) redirect("/no-access");
  const supabase = await createClient();
  const { data } = await supabase
    .from("csv_import_mappings")
    .select("mapping")
    .eq("import_type", "orders")
    .maybeSingle();
  return (
    <PageContainer>
      <SettingsHeader
        title="Import orders"
        backHref="/orders"
        backLabel="Orders"
        description="Upload a CSV from your order system or a spreadsheet. Nothing is saved until you've checked it."
      />
      <ImportWizard remembered={(data?.mapping ?? {}) as Mapping} />
    </PageContainer>
  );
}
