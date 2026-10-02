import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { orderFormOptions } from "@/lib/orders/form-data";
import { ORDER_SELECT, type OrderRow } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";
import { OrderForm } from "../../order-form";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: PageProps<"/orders/[id]/edit">) {
  const session = await requireArea("orders");
  if (!can(session.membership.role, "orders.edit")) redirect("/no-access");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: order }, options] = await Promise.all([
    supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle(),
    orderFormOptions(),
  ]);
  if (!order) notFound();
  const o = order as unknown as OrderRow;
  return (
    <PageContainer>
      <SettingsHeader
        title={`Edit ${o.order_ref}`}
        backHref={`/orders/${id}`}
        backLabel={o.order_ref}
      />
      <OrderForm order={o} {...options} />
    </PageContainer>
  );
}
