"use client";

import {
  Bookmark,
  ClipboardList,
  Download,
  Plus,
  Search,
  SearchX,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ReadinessBadge, StatusBadge, UrgencyBadge } from "@/components/orders/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/table";
import { Truncate } from "@/components/ui/truncate";
import { downloadCsv } from "@/lib/download";
import { formatLocalDate, formatNumber, fromIsoDate, londonToday } from "@/lib/format";
import { ORDER_STATUS, READINESS, URGENCY, optionFor } from "@/lib/orders/options";
import { formatWeight, totalWeightKg, unitsSummary } from "@/lib/orders/summary";
import type { OrderRow } from "@/lib/orders/types";

export type OrderFilters = {
  q: string;
  show: "open" | "all" | "delivered" | "cancelled";
  readiness: "any" | "ready" | "not_ready";
};

type SavedFilter = { name: string; filters: OrderFilters };
const SAVED_KEY = "hp-order-filters";

function loadSaved(): SavedFilter[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SavedFilter[];
  } catch {
    return [];
  }
}

function storeSaved(list: SavedFilter[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: saved filters just won't persist.
  }
}

const date = (iso: string | null) => (iso ? formatLocalDate(fromIsoDate(iso)) : "–");

export function OrdersList({
  rows,
  total,
  limit,
  filters,
  canEdit,
}: {
  rows: OrderRow[];
  total: number;
  limit: number;
  filters: OrderFilters;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNav] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read saved filters after hydration
  useEffect(() => setSaved(loadSaved()), []);

  // The filters last asked for. Props lag behind navigation, so a quick
  // second change (or the debounced search) must build on this, not on props.
  const intended = useRef(filters);
  useEffect(() => {
    intended.current = filters;
  }, [filters]);

  function apply(next: Partial<OrderFilters>) {
    const merged = { ...intended.current, ...next };
    intended.current = merged;
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.show !== "open") params.set("show", merged.show);
    if (merged.readiness !== "any") params.set("readiness", merged.readiness);
    const qs = params.toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if (query === intended.current.q) return;
    const t = setTimeout(() => {
      if (query !== intended.current.q) apply({ q: query });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const columns: Column<OrderRow>[] = [
    {
      id: "ref",
      header: "Order ref",
      hideable: false,
      sortValue: (o) => o.order_ref,
      cell: (o) => (
        <Link href={`/orders/${o.id}`} className="font-medium text-accent-text hover:underline">
          {o.order_ref}
        </Link>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      sortValue: (o) => o.customer?.name,
      cell: (o) => <Truncate>{o.customer?.name ?? "–"}</Truncate>,
      className: "max-w-menu",
    },
    {
      id: "site",
      header: "Site",
      sortValue: (o) => o.site?.postcode,
      cell: (o) => (
        <span className="flex flex-col">
          <Truncate>{o.site?.name ?? "–"}</Truncate>
          <span className="text-text-subtle">{o.site?.postcode}</span>
        </span>
      ),
      className: "max-w-menu",
    },
    {
      id: "required",
      header: "Required",
      align: "right",
      sortValue: (o) => o.required_date,
      cell: (o) => date(o.required_date),
    },
    { id: "units", header: "Units", cell: (o) => unitsSummary(o.lines) },
    {
      id: "weight",
      header: "Weight",
      align: "right",
      sortValue: (o) => totalWeightKg(o.lines),
      cell: (o) => formatWeight(o.lines),
    },
    {
      id: "readiness",
      header: "Readiness",
      sortValue: (o) => READINESS.findIndex((r) => r.value === o.readiness),
      cell: (o) => (
        <span className="flex flex-wrap items-center gap-1">
          <ReadinessBadge value={o.readiness} />
          <UrgencyBadge value={o.urgency} />
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (o) => o.status,
      cell: (o) => <StatusBadge value={o.status} />,
    },
    {
      id: "po",
      header: "Customer PO",
      defaultHidden: true,
      sortValue: (o) => o.customer_po,
      cell: (o) => o.customer_po || "–",
    },
    {
      id: "dn",
      header: "Delivery note",
      defaultHidden: true,
      sortValue: (o) => o.delivery_note_number,
      cell: (o) => o.delivery_note_number || "–",
    },
    {
      id: "invoice",
      header: "Invoice",
      defaultHidden: true,
      sortValue: (o) => o.invoice_number,
      cell: (o) => o.invoice_number || "–",
    },
  ];

  function exportCsv() {
    const headers = [
      "Order ref",
      "Customer",
      "Account ref",
      "Site",
      "Postcode",
      "Customer PO",
      "Delivery note",
      "Invoice",
      "Required date",
      "Urgency",
      "Readiness",
      "Status",
      "Units",
      "Weight (kg)",
    ];
    const body = rows.map((o) => [
      o.order_ref,
      o.customer?.name,
      o.customer?.account_ref,
      o.site?.name,
      o.site?.postcode,
      o.customer_po,
      o.delivery_note_number,
      o.invoice_number,
      date(o.required_date),
      optionFor(URGENCY, o.urgency).label,
      optionFor(READINESS, o.readiness).label,
      optionFor(ORDER_STATUS, o.status).label,
      unitsSummary(o.lines),
      Math.round(totalWeightKg(o.lines)),
    ]);
    downloadCsv(`orders-${londonToday()}.csv`, headers, body);
  }

  const filtered = Boolean(filters.q || filters.show !== "open" || filters.readiness !== "any");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={exportCsv} disabled={!rows.length}>
          <Download aria-hidden />
          Export CSV
        </Button>
        {canEdit ? (
          <>
            <Button asChild>
              <Link href="/orders/import">
                <Upload aria-hidden />
                Import CSV
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/orders/new">
                <Plus aria-hidden />
                New order
              </Link>
            </Button>
          </>
        ) : null}
      </div>

      <DataTable
        label="Orders"
        columns={columns}
        rows={rows}
        getRowId={(o) => o.id}
        initialSort={{ columnId: "required", direction: "asc" }}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        columnChooser
        scrollClassName="max-h-panel"
        toolbar={
          <>
            <Input
              type="search"
              leadingIcon={<Search />}
              placeholder="Ref, PO, delivery note, customer or postcode"
              aria-label="Search orders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="md:w-popover"
            />
            <Select
              aria-label="Which orders"
              value={filters.show}
              onValueChange={(v) => apply({ show: v as OrderFilters["show"] })}
              options={[
                { value: "open", label: "Open orders" },
                { value: "all", label: "All orders" },
                { value: "delivered", label: "Delivered" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              className="md:w-menu"
            />
            <Select
              aria-label="Readiness"
              value={filters.readiness}
              onValueChange={(v) => apply({ readiness: v as OrderFilters["readiness"] })}
              options={[
                { value: "any", label: "Any readiness" },
                { value: "ready", label: "Ready" },
                { value: "not_ready", label: "Not ready yet" },
              ]}
              className="md:w-menu"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Bookmark aria-hidden />
                  Saved filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-popover">
                <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
                {saved.length ? (
                  saved.map((s) => (
                    <DropdownMenuItem
                      key={s.name}
                      onSelect={() => {
                        setQuery(s.filters.q);
                        apply(s.filters);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <button
                        type="button"
                        aria-label={`Delete saved filter ${s.name}`}
                        className="rounded-sm p-1 hover:bg-surface"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const next = saved.filter((x) => x.name !== s.name);
                          setSaved(next);
                          storeSaved(next);
                        }}
                      >
                        <Trash2 aria-hidden />
                      </button>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <p className="px-2 py-1 text-sm text-text-subtle">None yet.</p>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!filtered} onSelect={() => setSaveOpen(true)}>
                  <Plus aria-hidden />
                  Save current filter…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        renderCard={(o) => (
          <Link href={`/orders/${o.id}`} className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-accent-text">{o.order_ref}</span>
              <ReadinessBadge value={o.readiness} />
              <UrgencyBadge value={o.urgency} />
              {o.status !== "unplanned" ? <StatusBadge value={o.status} /> : null}
            </span>
            <span className="text-sm">{o.customer?.name}</span>
            <span className="text-sm text-text-muted">
              {o.site?.postcode} · required {date(o.required_date)} · {unitsSummary(o.lines)} ·{" "}
              {formatWeight(o.lines)}
            </span>
          </Link>
        )}
        empty={
          filtered ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No orders match"
              description="Try another reference, or show all orders rather than just open ones."
              action={
                <Button
                  onClick={() => {
                    setQuery("");
                    apply({ q: "", show: "open", readiness: "any" });
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              compact
              icon={ClipboardList}
              title="No open orders"
              description="Add orders one at a time or import them from a spreadsheet. Each is checked for readiness, site restrictions and capacity when you plan it."
              action={
                canEdit ? (
                  <Button asChild variant="primary">
                    <Link href="/orders/new">New order</Link>
                  </Button>
                ) : undefined
              }
              secondaryAction={
                canEdit ? (
                  <Button asChild>
                    <Link href="/orders/import">Import CSV</Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      {total > rows.length ? (
        <Card className="p-4 text-sm text-text-muted">
          Showing the first {formatNumber(limit)} of {formatNumber(total)} orders. Search or filter
          to narrow them down.
        </Card>
      ) : null}

      <SaveFilterModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSave={(name) => {
          const next = [
            ...saved.filter((s) => s.name !== name),
            { name, filters: { ...filters, q: query } },
          ];
          setSaved(next);
          storeSaved(next);
          setSaveOpen(false);
        }}
      />
    </div>
  );
}

function SaveFilterModal({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Save this filter"
      description="Saved on this device for quick access."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError("Give the filter a name.");
          onSave(name.trim().slice(0, 40));
          setName("");
          setError(null);
        }}
      >
        <Field label="Name" error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Not ready, this week"
          />
        </Field>
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save filter
          </Button>
        </div>
      </form>
    </Modal>
  );
}
