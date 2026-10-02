import type { Metadata } from "next";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { OPEN_STATUSES, ORDER_SELECT, type OrderRow } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";
import { OrdersList, type OrderFilters } from "./orders-list";

export const metadata: Metadata = { title: "Orders" };

const LIMIT = 500;

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const session = await requireArea("orders");
  await connection();
  const params = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const filters: OrderFilters = {
    q: str(params.q).slice(0, 100),
    show: (["open", "all", "delivered", "cancelled"].includes(str(params.show))
      ? str(params.show)
      : "open") as OrderFilters["show"],
    readiness: (["any", "ready", "not_ready"].includes(str(params.readiness))
      ? str(params.readiness)
      : "any") as OrderFilters["readiness"],
  };

  const supabase = await createClient();
  let query = supabase.from("orders").select(ORDER_SELECT, { count: "exact" });
  if (filters.q.trim()) {
    // One box searches order ref, PO, delivery note, invoice, customer and postcode.
    const term = filters.q
      .trim()
      .toLowerCase()
      .replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.ilike("search_text", `%${term}%`);
  }
  if (filters.show === "open") query = query.in("status", OPEN_STATUSES);
  if (filters.show === "delivered") query = query.eq("status", "delivered");
  if (filters.show === "cancelled") query = query.eq("status", "cancelled");
  if (filters.readiness === "ready") query = query.eq("readiness", "ready");
  if (filters.readiness === "not_ready") query = query.neq("readiness", "ready");
  const { data, count } = await query.order("required_date").order("order_ref").limit(LIMIT);

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Search by order ref, PO number, delivery note, invoice, customer or postcode."
      />
      <OrdersList
        rows={(data ?? []) as unknown as OrderRow[]}
        total={count ?? 0}
        limit={LIMIT}
        filters={filters}
        canEdit={can(session.membership.role, "orders.edit")}
      />
    </PageContainer>
  );
}
