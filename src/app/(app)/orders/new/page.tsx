import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { orderFormOptions } from "@/lib/orders/form-data";
import { OrderForm } from "../order-form";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  const session = await requireArea("orders");
  if (!can(session.membership.role, "orders.edit")) redirect("/no-access");
  const options = await orderFormOptions();
  return (
    <PageContainer>
      <SettingsHeader title="New order" backHref="/orders" backLabel="Orders" />
      <OrderForm order={null} {...options} />
    </PageContainer>
  );
}
