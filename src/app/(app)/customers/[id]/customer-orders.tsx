import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { ReadinessBadge, StatusBadge, UrgencyBadge } from "@/components/orders/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIsoDate, plural } from "@/lib/format";
import { unitsSummary } from "@/lib/orders/summary";
import { OPEN_STATUSES, type OrderRow } from "@/lib/orders/types";

export type CustomerOrder = Pick<
  OrderRow,
  | "id"
  | "order_ref"
  | "customer_po"
  | "required_date"
  | "urgency"
  | "readiness"
  | "status"
  | "lines"
> & { site: { name: string; postcode: string } | null };

/** A customer's orders: open ones by date first, then the latest finished ones. */
export function CustomerOrders({
  orders,
  total,
  search,
  canSeeOrders,
  canEditOrders,
}: {
  orders: CustomerOrder[];
  /** Orders this customer has in all, which can be more than are listed. */
  total: number;
  /** What to search for in Orders to see them all. */
  search: string;
  canSeeOrders: boolean;
  canEditOrders: boolean;
}) {
  const open = orders
    .filter((o) => OPEN_STATUSES.includes(o.status))
    .sort((a, b) => a.required_date.localeCompare(b.required_date));
  const done = orders.filter((o) => !OPEN_STATUSES.includes(o.status));
  const newOrder = canEditOrders ? (
    <Button asChild size="sm" variant="primary">
      <Link href="/orders/new">
        <Plus aria-hidden />
        New order
      </Link>
    </Button>
  ) : null;

  if (!orders.length) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No orders for this customer yet"
          description="Their orders will be listed here with their delivery dates and status."
          action={newOrder}
        />
      </Card>
    );
  }

  const list = (label: string, rows: CustomerOrder[]) =>
    rows.length ? (
      <section aria-label={label} className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-semibold">
          {label} <span className="num font-normal text-text-muted">({rows.length})</span>
        </h3>
        <ul aria-label={label} className="flex flex-col divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2">
              {canSeeOrders ? (
                <Link
                  href={`/orders/${o.id}`}
                  className="text-sm font-medium text-accent-text hover:underline"
                >
                  {o.order_ref}
                </Link>
              ) : (
                <span className="text-sm font-medium">{o.order_ref}</span>
              )}
              <span className="num text-sm text-text-muted">{formatIsoDate(o.required_date)}</span>
              <span className="order-last w-full min-w-0 truncate text-sm md:order-none md:w-auto md:flex-1">
                {o.site ? `${o.site.name} · ${o.site.postcode}` : ""}
              </span>
              <span className="num text-xs text-text-muted">{unitsSummary(o.lines)}</span>
              <span className="flex flex-wrap gap-1">
                <UrgencyBadge value={o.urgency} />
                {o.status === "unplanned" ? <ReadinessBadge value={o.readiness} /> : null}
                <StatusBadge value={o.status} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          <span className="num">{plural(total, "order")}</span>
          {total > orders.length ? `, showing the latest ${orders.length}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {canSeeOrders ? (
            <Button asChild size="sm">
              <Link href={`/orders?show=all&q=${encodeURIComponent(search)}`}>Open in Orders</Link>
            </Button>
          ) : null}
          {newOrder}
        </div>
      </div>
      {list("Open orders", open)}
      {list("Delivered and cancelled", done)}
    </Card>
  );
}
