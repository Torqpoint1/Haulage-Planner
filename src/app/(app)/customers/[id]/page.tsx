import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageContainer } from "@/components/shell/page";
import { loadAssetRegister } from "@/lib/assets/data";
import { can, canAccess } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import type { Contact, Customer, Site } from "@/lib/customers/types";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOrder } from "./customer-orders";
import { CustomerView } from "./customer-view";

const ORDER_LIMIT = 100;

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const session = await requireArea("customers");
  await connection();
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const [
    { data: customer },
    { data: sites },
    { data: contacts },
    { data: org },
    { data: orders, count: orderCount },
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("sites").select("*").eq("customer_id", id).order("name"),
    supabase.from("contacts").select("*").eq("customer_id", id).order("name"),
    supabase
      .from("organisations")
      .select("site_info_stale_days")
      .eq("id", session.membership.organisation.id)
      .single(),
    supabase
      .from("orders")
      .select(
        "id, order_ref, customer_po, required_date, urgency, readiness, status, site:sites(name, postcode), lines:order_lines(unit_type_id, quantity, weight_per_unit_kg, description, unit_type:unit_types(short_code, name))",
        { count: "exact" },
      )
      .eq("customer_id", id)
      .order("required_date", { ascending: false })
      .limit(ORDER_LIMIT),
  ]);
  if (!customer) notFound();
  const { assets } = await loadAssetRegister({ customerId: id });

  return (
    <PageContainer>
      <CustomerView
        customer={customer as Customer}
        sites={(sites ?? []) as Site[]}
        contacts={(contacts ?? []) as Contact[]}
        staleDays={org?.site_info_stale_days ?? 180}
        canEdit={can(session.membership.role, "customers.edit")}
        assets={assets}
        canSeeAssets={canAccess(session.membership.role, "history")}
        orders={{
          rows: (orders ?? []) as unknown as CustomerOrder[],
          total: orderCount ?? 0,
          canSee: canAccess(session.membership.role, "orders"),
          canEdit: can(session.membership.role, "orders.edit"),
        }}
        initialTab={typeof tab === "string" ? tab : "sites"}
      />
    </PageContainer>
  );
}
