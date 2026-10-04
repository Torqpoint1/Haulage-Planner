import type { Metadata } from "next";
import { Upload } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { siteFreshness } from "@/lib/customers/sites";
import { createClient } from "@/lib/supabase/server";
import { CustomersManager, type CustomerRow } from "./customers-manager";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const session = await requireArea("customers");
  await connection();
  const supabase = await createClient();
  const [{ data: customers }, { data: org }] = await Promise.all([
    supabase
      .from("customers")
      .select("*, sites(postcode, last_verified_at), contacts(count)")
      .order("name"),
    supabase
      .from("organisations")
      .select("site_info_stale_days")
      .eq("id", session.membership.organisation.id)
      .single(),
  ]);
  const staleDays = org?.site_info_stale_days ?? 180;
  const now = new Date();
  const rows: CustomerRow[] = (customers ?? []).map((c) => {
    const sites = (c.sites ?? []) as { postcode: string; last_verified_at: string | null }[];
    return {
      id: c.id,
      name: c.name,
      account_ref: c.account_ref,
      default_delivery_instructions: c.default_delivery_instructions,
      notes: c.notes,
      siteCount: sites.length,
      postcodes: sites.map((s) => s.postcode),
      staleSites: sites.filter((s) => siteFreshness(s.last_verified_at, staleDays, now).stale)
        .length,
      contactCount: (c.contacts as unknown as { count: number }[])[0]?.count ?? 0,
    };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Customers, their delivery sites, contacts and site restrictions."
        actions={
          can(session.membership.role, "customers.edit") ? (
            <Button asChild>
              <Link href="/customers/import">
                <Upload aria-hidden />
                Import CSV
              </Link>
            </Button>
          ) : null
        }
      />
      <CustomersManager rows={rows} canEdit={can(session.membership.role, "customers.edit")} />
    </PageContainer>
  );
}
