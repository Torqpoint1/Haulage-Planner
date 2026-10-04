"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  History as HistoryIcon,
  Search,
  SearchX,
  Truck,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OutcomeBadge, PodModal } from "@/app/(app)/plan/pod-modal";
import { Badge, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { downloadCsv } from "@/lib/download";
import {
  formatDateLong,
  formatDateTime,
  formatIsoDate,
  fromIsoDate,
  plural,
  toIsoDate,
} from "@/lib/format";
import {
  EMPTY_FILTERS,
  dateRange,
  recentMonths,
  toSearchParams,
  type HistoryFilters,
} from "@/lib/history/filters";
import type { HistoryChoices, HistoryLoad, HistoryResults } from "@/lib/history/search";
import { optionFor } from "@/lib/orders/options";
import { CONFIRMATION_METHODS, LOAD_STATUSES } from "@/lib/planning/types";

const ANY = "any";

function exportResults(results: HistoryResults, label: string) {
  const rows = results.loads.flatMap((l) =>
    l.stops.flatMap((s) =>
      s.orders.flatMap((o) =>
        o.lines.map((line) => [
          formatIsoDate(l.date),
          l.title,
          l.drivers,
          s.customerName,
          s.siteName,
          s.postcode,
          o.ref,
          o.customerPo,
          o.deliveryNote,
          line.unit,
          line.description,
          line.quantity,
          line.delivered ?? "",
          s.status.replace("_", " "),
        ]),
      ),
    ),
  );
  downloadCsv(
    `history-${label}.csv`,
    [
      "Date",
      "Vehicle or haulier",
      "Driver",
      "Customer",
      "Site",
      "Postcode",
      "Order",
      "PO",
      "Delivery note",
      "Item",
      "Description",
      "Quantity",
      "Delivered",
      "Outcome",
    ],
    rows,
  );
}

function LoadResult({ load }: { load: HistoryLoad }) {
  const [pod, setPod] = useState<{ id: string; title: string } | null>(null);
  const status = optionFor(LOAD_STATUSES, load.status);
  return (
    <li>
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <Truck className="mt-1 size-icon shrink-0 text-text-muted" aria-hidden />
            <div className="flex min-w-0 flex-col">
              <h3 className="truncate text-base font-semibold">
                {formatDateLong(fromIsoDate(load.date))}
              </h3>
              <p className="truncate text-sm text-text-muted">
                {[load.title, load.subtitle, load.drivers].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <Badge tone={status.tone as StatusTone}>{status.label}</Badge>
        </header>
        <ol
          className="flex min-w-0 flex-col gap-3"
          aria-label={`Deliveries on ${formatIsoDate(load.date)}`}
        >
          {load.stops.map((s) => (
            <li
              key={s.id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {s.customerName} · {s.siteName}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    Drop {s.sequence} · {s.postcode}
                    {s.bookingRef
                      ? ` · booking ${s.bookingRef}${s.bookingSlot ? ` at ${s.bookingSlot}` : ""}`
                      : ""}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.status !== "pending" ? <OutcomeBadge status={s.status} /> : null}
                  {s.hasPod ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        setPod({ id: s.id, title: `${s.siteName} on ${formatIsoDate(load.date)}` })
                      }
                    >
                      Proof of delivery
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-text-muted">
                {s.confirmation.confirmed
                  ? [
                      "Confirmed",
                      s.confirmation.by ? `by ${s.confirmation.by}` : "",
                      s.confirmation.method
                        ? `by ${optionFor(CONFIRMATION_METHODS, s.confirmation.method).label.toLowerCase()}`
                        : "",
                      s.confirmation.at ? `on ${formatDateTime(s.confirmation.at)}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "Delivery not confirmed with the customer"}
                {s.confirmation.note ? `. ${s.confirmation.note}` : ""}
                {s.confirmation.attachmentUrl ? (
                  <>
                    {" · "}
                    <a
                      href={s.confirmation.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent-text hover:underline"
                    >
                      Confirmation attachment
                    </a>
                  </>
                ) : null}
              </p>

              <ul className="flex min-w-0 flex-col gap-2">
                {s.orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-muted p-3"
                  >
                    <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm">
                      <a href={`/orders/${o.id}`} className="font-semibold hover:underline">
                        {o.ref}
                      </a>
                      {o.customerPo ? (
                        <span className="text-text-muted">PO {o.customerPo}</span>
                      ) : null}
                      {o.deliveryNote ? (
                        <span className="text-text-muted">DN {o.deliveryNote}</span>
                      ) : null}
                    </p>
                    <ul className="flex flex-col text-sm">
                      {o.lines.map((l) => (
                        <li key={l.id} className="flex min-w-0 gap-2">
                          <span className="num shrink-0 font-medium">{l.quantity} ×</span>
                          <span className="min-w-0 truncate">
                            {l.unit}
                            {l.description ? ` · ${l.description}` : ""}
                          </span>
                          {l.delivered != null && l.delivered !== l.quantity ? (
                            <Badge tone="warning">{l.delivered} delivered</Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {o.documents.length ? (
                      <ul aria-label={`Documents for ${o.ref}`} className="flex flex-wrap gap-2">
                        {o.documents.map((d) =>
                          d.url ? (
                            <li key={d.name}>
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
                              >
                                <FileText className="size-icon-sm" aria-hidden />
                                {d.name}
                              </a>
                            </li>
                          ) : null,
                        )}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
      {pod ? (
        <PodModal
          stopId={pod.id}
          title={pod.title}
          canEdit={false}
          open
          onOpenChange={(o) => !o && setPod(null)}
        />
      ) : null}
    </li>
  );
}

/**
 * History search (spec 9.6): customer and month answer "what did we send X
 * in Y?" in one search; refs, PO, delivery note, vehicle, driver and haulier
 * narrow it further. The search lives in the URL.
 */
export function HistorySearch({
  filters,
  results,
  choices,
  today,
}: {
  filters: HistoryFilters;
  results: HistoryResults | null;
  choices: HistoryChoices;
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [f, setF] = useState<HistoryFilters>(filters);
  const [more, setMore] = useState(
    Boolean(
      filters.site ||
      filters.vehicle ||
      filters.driver ||
      filters.haulier ||
      filters.from ||
      filters.to,
    ),
  );
  const set = (patch: Partial<HistoryFilters>) => setF((x) => ({ ...x, ...patch }));
  const search = (next: HistoryFilters) =>
    start(() => router.push(`${pathname}?${toSearchParams(next)}`));
  const months = recentMonths(today);
  const sites = choices.sites.filter((s) => !f.customer || s.customerId === f.customer);
  const range = dateRange(filters);
  const customerName = choices.customers.find((c) => c.id === filters.customer)?.name;
  const monthLabel = months.find((m) => m.value === filters.month)?.label;

  const pick = (
    list: { id: string; name: string }[],
    value: string | null,
    key: keyof HistoryFilters,
    label: string,
  ) => (
    <Field label={label}>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => set({ [key]: v === ANY ? null : v } as Partial<HistoryFilters>)}
        options={[
          { value: ANY, label: `Any ${label.toLowerCase()}` },
          ...list.map((x) => ({ value: x.id, label: x.name })),
        ]}
      />
    </Field>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form
        role="search"
        aria-label="Search history"
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          search(f);
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Customer">
            <Combobox
              value={f.customer}
              onValueChange={(v) => set({ customer: v, site: null })}
              placeholder="Any customer"
              searchPlaceholder="Find a customer"
              options={choices.customers.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Month">
            <Select
              value={f.month ?? ANY}
              onValueChange={(v) => set({ month: v === ANY ? null : v, from: null, to: null })}
              options={[{ value: ANY, label: "Any time" }, ...months]}
            />
          </Field>
          <Field label="Reference">
            <Input
              leadingIcon={<Search />}
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Order, PO, delivery note, site, vehicle…"
            />
          </Field>
        </div>

        <button
          type="button"
          className="flex w-fit items-center gap-1 text-sm font-medium text-accent-text hover:underline"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
        >
          {more ? (
            <ChevronDown className="size-icon-sm" aria-hidden />
          ) : (
            <ChevronRight className="size-icon-sm" aria-hidden />
          )}
          More filters
        </button>
        {more ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Site">
              <Combobox
                value={f.site}
                onValueChange={(v) => set({ site: v })}
                placeholder="Any site"
                searchPlaceholder="Site or postcode"
                options={sites.map((s) => ({
                  value: s.id,
                  label: s.name,
                  description: s.postcode,
                  keywords: [s.postcode],
                }))}
              />
            </Field>
            <Field label="From">
              <DatePicker
                value={f.from ? fromIsoDate(f.from) : null}
                onValueChange={(d) => set({ from: d ? toIsoDate(d) : null, month: null })}
              />
            </Field>
            <Field label="To">
              <DatePicker
                value={f.to ? fromIsoDate(f.to) : null}
                onValueChange={(d) => set({ to: d ? toIsoDate(d) : null, month: null })}
              />
            </Field>
            {pick(choices.vehicles, f.vehicle, "vehicle", "Vehicle")}
            {pick(choices.drivers, f.driver, "driver", "Driver")}
            {pick(choices.hauliers, f.haulier, "haulier", "Haulier")}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={pending}>
            <Search aria-hidden />
            Search
          </Button>
          {results ? (
            <Button
              onClick={() => {
                setF(EMPTY_FILTERS);
                search(EMPTY_FILTERS);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {results === null ? (
        <Card>
          <EmptyState
            icon={HistoryIcon}
            title="Search past deliveries"
            description="Choose a customer and a month to see everything you sent them, or search by order ref, PO or delivery note."
          />
        </Card>
      ) : results.loads.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No deliveries match"
            description="Try a wider date range or fewer filters."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setF(EMPTY_FILTERS);
                  search(EMPTY_FILTERS);
                }}
              >
                Clear search
              </Button>
            }
          />
        </Card>
      ) : (
        <section aria-label="Results" className="flex min-w-0 flex-col gap-4" aria-busy={pending}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-lg font-semibold">
                {customerName ? `Sent to ${customerName}` : "Deliveries"}
                {monthLabel
                  ? ` in ${monthLabel}`
                  : range.from || range.to
                    ? ` ${range.from ? `from ${formatIsoDate(range.from)}` : ""}${range.to ? ` to ${formatIsoDate(range.to)}` : ""}`
                    : ""}
              </h2>
              <p className="text-sm text-text-muted" role="status">
                <span className="num">{plural(results.loads.length, "load")}</span> ·{" "}
                <span className="num">{plural(results.deliveries, "delivery", "deliveries")}</span>{" "}
                · <span className="num">{plural(results.orders, "order")}</span>
                {results.units.length
                  ? ` · ${results.units.map((u) => `${u.quantity} ${u.unit}`).join(", ")}`
                  : ""}
              </p>
              {results.truncated ? (
                <p className="text-sm text-warning-fg">
                  Showing the first 500 matches. Narrow the search to see the rest.
                </p>
              ) : null}
            </div>
            <Button
              onClick={() =>
                exportResults(
                  results,
                  [filters.month, customerName].filter(Boolean).join("-") || "search",
                )
              }
            >
              <Download aria-hidden />
              Export CSV
            </Button>
          </div>
          <ol className="flex min-w-0 flex-col gap-4" aria-label="Loads">
            {results.loads.map((l) => (
              <LoadResult key={l.id} load={l} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
