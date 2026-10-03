"use client";

import { useDraggable } from "@dnd-kit/core";
import { ClipboardList, GripVertical, Plus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ReadinessBadge, UrgencyBadge } from "@/components/orders/badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { matchesSearch } from "@/components/ui/combobox";
import { cn } from "@/lib/cn";
import { formatIsoDate, formatLocalDayShort, fromIsoDate } from "@/lib/format";
import { loadTitle, postcodeArea, unitsText } from "@/lib/planning/labels";
import type { PlanData, PlanOrder } from "@/lib/planning/types";

type Filters = {
  q: string;
  due: string;
  zone: string;
  customer: string;
  readiness: string;
  urgency: string;
};
const NO_FILTERS: Filters = {
  q: "",
  due: "any",
  zone: "any",
  customer: "any",
  readiness: "any",
  urgency: "any",
};

function OrderCard({
  order,
  data,
  canEdit,
  onAdd,
  onNewLoad,
  dragging,
}: {
  order: PlanOrder;
  data: PlanData;
  canEdit: boolean;
  onAdd: (loadId: string) => void;
  onNewLoad: () => void;
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `order:${order.id}`,
    disabled: !canEdit,
  });
  const site = data.sites[order.site_id];
  const loads = data.loads.filter((l) => !["loading", "out", "complete"].includes(l.status));

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-md border border-border bg-surface p-3",
        (isDragging || dragging) && "opacity-50",
      )}
    >
      {canEdit ? (
        <button
          type="button"
          className="-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-text-subtle hover:bg-surface-muted hover:text-text focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          aria-label={`Drag ${order.order_ref} onto a load`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-icon-sm" aria-hidden />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <Link
            href={`/orders/${order.id}`}
            className="truncate text-sm font-semibold hover:underline"
          >
            {order.order_ref}
          </Link>
          <span className="num shrink-0 text-xs text-text-muted">
            {formatIsoDate(order.required_date)}
          </span>
        </div>
        <span className="truncate text-sm">{order.customer_name}</span>
        <span className="truncate text-xs text-text-muted">
          {site ? `${site.name} · ${site.postcode}` : ""}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="text-xs font-medium">{unitsText([order], data.unitTypes)}</span>
          <ReadinessBadge value={order.readiness} />
          <UrgencyBadge value={order.urgency} />
        </div>
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`Add ${order.order_ref} to a load`}
            >
              <Plus aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Add {order.order_ref} to…</DropdownMenuLabel>
            {loads.map((l) => (
              <DropdownMenuItem key={l.id} onSelect={() => onAdd(l.id)}>
                {formatLocalDayShort(fromIsoDate(l.load_date))} · {loadTitle(l, data).title}
              </DropdownMenuItem>
            ))}
            {loads.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={onNewLoad}>New load…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

export function OrderPool({
  data,
  today,
  weekEnd,
  canEdit,
  activeOrderId,
  onAdd,
  onNewLoad,
}: {
  data: PlanData;
  today: string;
  weekEnd: string;
  canEdit: boolean;
  activeOrderId: string | null;
  onAdd: (orderId: string, loadId: string) => void;
  onNewLoad: (orderId: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const pool = data.pool.map((id) => data.orders[id]).filter(Boolean);

  const customers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of pool) seen.set(o.customer_id, o.customer_name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pool]);

  const shown = pool.filter((o) => {
    const site = data.sites[o.site_id];
    if (
      filters.q &&
      !matchesSearch(
        `${o.order_ref} ${o.customer_name} ${site?.name ?? ""} ${site?.postcode ?? ""}`,
        filters.q,
      )
    ) {
      return false;
    }
    if (filters.due === "overdue" && o.required_date >= today) return false;
    if (filters.due === "week" && o.required_date > weekEnd) return false;
    if (filters.zone !== "any") {
      const zone = data.postcodeZones.find((z) => z.id === filters.zone);
      if (!site || !zone?.postcode_areas.includes(postcodeArea(site.postcode))) return false;
    }
    if (filters.customer !== "any" && o.customer_id !== filters.customer) return false;
    if (filters.readiness === "ready" && o.readiness !== "ready") return false;
    if (filters.readiness === "not_ready" && o.readiness === "ready") return false;
    if (filters.urgency !== "any" && o.urgency !== filters.urgency) return false;
    return true;
  });
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <aside
      aria-label="Unplanned orders"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 xl:sticky xl:top-4 xl:max-h-board xl:w-popover xl:shrink-0"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Unplanned orders</h2>
        <span className="num text-xs text-text-muted">
          {shown.length === pool.length ? pool.length : `${shown.length} of ${pool.length}`}
        </span>
      </div>
      <Input
        leadingIcon={<Search />}
        placeholder="Ref, customer or postcode"
        aria-label="Search unplanned orders"
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Due"
          value={filters.due}
          onValueChange={(due) => set({ due })}
          options={[
            { value: "any", label: "Any date" },
            { value: "week", label: "Due by this week" },
            { value: "overdue", label: "Overdue" },
          ]}
        />
        <Select
          aria-label="Readiness filter"
          value={filters.readiness}
          onValueChange={(readiness) => set({ readiness })}
          options={[
            { value: "any", label: "Readiness" },
            { value: "ready", label: "Ready only" },
            { value: "not_ready", label: "Not ready" },
          ]}
        />
        <Select
          aria-label="Postcode zone"
          value={filters.zone}
          onValueChange={(zone) => set({ zone })}
          options={[
            { value: "any", label: "All zones" },
            ...data.postcodeZones.map((z) => ({ value: z.id, label: z.name })),
          ]}
        />
        <Select
          aria-label="Urgency filter"
          value={filters.urgency}
          onValueChange={(urgency) => set({ urgency })}
          options={[
            { value: "any", label: "Urgency" },
            { value: "timed", label: "Timed" },
            { value: "critical", label: "Critical" },
          ]}
        />
        <Select
          aria-label="Customer filter"
          className="col-span-2"
          value={filters.customer}
          onValueChange={(customer) => set({ customer })}
          options={[
            { value: "any", label: "All customers" },
            ...customers.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
      </div>
      {shown.length ? (
        <ul
          className="-mr-2 flex min-h-0 flex-col gap-2 overflow-y-auto pr-2 scrollbar-thin"
          aria-label="Orders to plan"
        >
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              data={data}
              canEdit={canEdit}
              dragging={activeOrderId === o.id}
              onAdd={(loadId) => onAdd(o.id, loadId)}
              onNewLoad={() => onNewLoad(o.id)}
            />
          ))}
        </ul>
      ) : filtered ? (
        <EmptyState
          compact
          icon={SearchX}
          title="No orders match"
          action={
            <Button size="sm" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          compact
          icon={ClipboardList}
          title="No unplanned orders"
          description="Orders waiting to be planned appear here."
          action={
            <Button asChild size="sm">
              <Link href="/orders">Go to orders</Link>
            </Button>
          }
        />
      )}
    </aside>
  );
}
