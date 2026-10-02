import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import type { Contact, Customer, Site } from "@/lib/customers/types";
import { createClient } from "@/lib/supabase/server";
import { SiteView } from "./site-view";

export const metadata: Metadata = { title: "Site" };

export default async function SitePage({ params }: PageProps<"/customers/[id]/sites/[siteId]">) {
  const session = await requireArea("customers");
  await connection();
  const { id, siteId } = await params;
  const supabase = await createClient();
  const [{ data: site }, { data: customer }, { data: contacts }, { data: org }] = await Promise.all(
    [
      supabase.from("sites").select("*").eq("id", siteId).eq("customer_id", id).maybeSingle(),
      supabase.from("customers").select("*").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("*").eq("customer_id", id).order("name"),
      supabase
        .from("organisations")
        .select("site_info_stale_days")
        .eq("id", session.membership.organisation.id)
        .single(),
    ],
  );
  if (!site || !customer) notFound();

  let verifiedByName: string | null = null;
  if (site.verified_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", site.verified_by)
      .maybeSingle();
    verifiedByName = profile?.full_name || profile?.email || null;
  }

  const siteContacts = ((contacts ?? []) as Contact[]).filter(
    (c) => c.site_id === siteId || c.site_id === null,
  );

  return (
    <PageContainer>
      <SiteView
        site={site as Site}
        customer={customer as Customer}
        contacts={siteContacts}
        verifiedByName={verifiedByName}
        staleDays={org?.site_info_stale_days ?? 180}
        canEdit={can(session.membership.role, "customers.edit")}
      />
    </PageContainer>
  );
}
