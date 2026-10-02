import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageContainer } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import type { Site } from "@/lib/customers/types";
import { describeHistory, type AuditEntry } from "@/lib/orders/history";
import { ORDER_SELECT, type OrderRow } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";
import { OrderView, type Attachment } from "./order-view";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const session = await requireArea("orders");
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: order }, { data: attachments }, { data: audit }] = await Promise.all([
    supabase
      .from("orders")
      .select(`${ORDER_SELECT}, site_detail:sites(*)`)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_attachments")
      .select("id, file_name, content_type, size_bytes, storage_path, created_at")
      .eq("order_id", id)
      .order("created_at"),
    supabase
      .from("audit_log")
      .select("id, table_name, action, actor_id, before, after, created_at")
      .in("table_name", ["orders", "order_lines", "order_attachments"])
      .or(`record_id.eq.${id},after->>order_id.eq.${id},before->>order_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (!order) notFound();

  const history = describeHistory((audit ?? []) as AuditEntry[]);
  const actorIds = [
    ...new Set(history.map((h) => h.actorId).filter((a): a is string => Boolean(a))),
  ];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  // Signed links last an hour; the page re-renders on every visit.
  const files = (attachments ?? []) as Omit<Attachment, "url">[];
  const { data: signed } = files.length
    ? await supabase.storage.from("organisation-files").createSignedUrls(
        files.map((f) => f.storage_path),
        3600,
      )
    : { data: [] };
  const withUrls: Attachment[] = files.map((f, i) => ({
    ...f,
    url: signed?.[i]?.signedUrl ?? null,
  }));

  return (
    <PageContainer>
      <OrderView
        order={order as unknown as OrderRow & { site_detail: Site | null }}
        attachments={withUrls}
        history={history.map((h) => ({
          ...h,
          actor: h.actorId ? (names[h.actorId] ?? "Someone") : "System",
        }))}
        orgId={session.membership.organisation.id}
        canEdit={can(session.membership.role, "orders.edit")}
      />
    </PageContainer>
  );
}
