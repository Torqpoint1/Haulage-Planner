"use client";

import { addDays, format } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  Printer,
  Truck,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDateLong, fromIsoDate, plural, toIsoDate } from "@/lib/format";
import { optionFor } from "@/lib/orders/options";
import { LOAD_STATUSES } from "@/lib/planning/types";
import type { SheetData, SheetLoad } from "@/lib/warehouse/data";
import { NOT_TICKED, type PickLine, type PickState } from "@/lib/warehouse/pick-sheet";
import { tickLine } from "./actions";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Picked and loaded as bars; they never turn amber, since more done is only good. */
function Progress({ load, size = "sm" }: { load: SheetLoad; size?: "sm" | "md" }) {
  const { totals } = load;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CapacityBar
        label="Picked"
        used={totals.picked}
        capacity={totals.lines}
        unit="lines"
        nearLimit={2}
        size={size}
      />
      <CapacityBar
        label="Loaded"
        used={totals.loaded}
        capacity={totals.lines}
        unit="lines"
        nearLimit={2}
        size={size}
      />
    </div>
  );
}

function TickButton({
  label,
  on,
  disabled,
  onClick,
  itemLabel,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  itemLabel: string;
}) {
  return (
    <Button
      size="lg"
      variant={on ? "primary" : "secondary"}
      aria-pressed={on}
      aria-label={`${label}: ${itemLabel}`}
      disabled={disabled}
      onClick={onClick}
      className="min-w-0 flex-1"
    >
      {on ? <Check aria-hidden /> : null}
      {label}
    </Button>
  );
}

function LineRow({
  line,
  canTick,
  locked,
  onChange,
  onShortage,
}: {
  line: PickLine;
  canTick: boolean;
  locked: boolean;
  onChange: (patch: Partial<PickState>) => void;
  onShortage: () => void;
}) {
  const { pick } = line;
  const itemLabel = `${line.quantity} × ${line.unitName}${line.description ? `, ${line.description}` : ""}`;
  return (
    <li className="flex min-w-0 flex-col gap-3 border-t border-border py-3 first:border-t-0 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-base font-semibold">
          <span className="num">{line.quantity}</span> × {line.unitName}{" "}
          <span className="text-sm font-normal text-text-muted">({line.unitCode})</span>
        </p>
        {line.description ? <p className="text-sm break-words">{line.description}</p> : null}
        {line.handling.length ? (
          <ul className="flex flex-wrap gap-1" aria-label="Handling">
            {line.handling.map((h) => (
              <li key={h}>
                <Chip>{h}</Chip>
              </li>
            ))}
          </ul>
        ) : null}
        {line.securing ? (
          <p className="text-sm break-words text-text-muted">Securing: {line.securing}</p>
        ) : null}
        {pick.shortage ? (
          <p className="flex items-start gap-1 text-sm text-warning-fg">
            <TriangleAlert className="mt-px size-icon-sm shrink-0" aria-hidden />
            <span className="break-words">
              <span className="font-medium">Shortage:</span> {pick.shortage_note}
            </span>
          </p>
        ) : null}
      </div>
      {canTick ? (
        <div className="flex min-w-0 shrink-0 flex-wrap gap-2 md:w-tick-actions">
          <TickButton
            label="Picked"
            on={pick.picked}
            disabled={locked}
            itemLabel={itemLabel}
            onClick={() => onChange({ picked: !pick.picked })}
          />
          <TickButton
            label="Loaded"
            on={pick.loaded}
            disabled={locked}
            itemLabel={itemLabel}
            onClick={() => onChange({ loaded: !pick.loaded })}
          />
          {pick.shortage ? (
            <Button
              size="lg"
              variant="ghost"
              disabled={locked}
              aria-label={`Clear shortage: ${itemLabel}`}
              onClick={() => onChange({ shortage: false, shortage_note: "" })}
            >
              <X aria-hidden />
              Clear shortage
            </Button>
          ) : (
            <Button
              size="lg"
              variant="ghost"
              disabled={locked}
              aria-label={`Flag shortage: ${itemLabel}`}
              onClick={onShortage}
            >
              <TriangleAlert aria-hidden />
              Shortage
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Badge tone={pick.picked ? "success" : "neutral"}>
            {pick.picked ? "Picked" : "Not picked"}
          </Badge>
          <Badge tone={pick.loaded ? "success" : "neutral"}>
            {pick.loaded ? "Loaded" : "Not loaded"}
          </Badge>
        </div>
      )}
    </li>
  );
}

function PickSheet({ load, canTick }: { load: SheetLoad; canTick: boolean }) {
  const [, start] = useTransition();
  // Ticks show straight away; the server confirms them (or puts them back).
  const [local, setLocal] = useState<Record<string, PickState>>({});
  const [source, setSource] = useState(load);
  if (source !== load) {
    setSource(load);
    setLocal({});
  }
  const [shortFor, setShortFor] = useState<PickLine | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const locked = load.status === "out" || load.status === "complete";

  function change(line: PickLine, patch: Partial<PickState>) {
    const current = local[line.id] ?? line.pick;
    setLocal((l) => ({ ...l, [line.id]: { ...current, ...patch } }));
    start(async () => {
      const r = await tickLine(line.id, {
        picked: patch.picked,
        loaded: patch.loaded,
        shortage: patch.shortage,
        note: patch.shortage_note,
      });
      if (!r.ok) {
        setLocal((l) => ({ ...l, [line.id]: current }));
        toast.error(r.error);
      }
    });
  }

  const withLocal = (l: PickLine): PickLine => ({
    ...l,
    pick: local[l.id] ?? l.pick ?? NOT_TICKED,
  });

  return (
    <section aria-label={`Pick sheet for ${load.title}`} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-lg font-semibold">{load.title}</h2>
          <p className="text-sm text-text-muted">
            {load.subtitle}
            {load.drivers ? ` · ${load.drivers}` : ""} · {plural(load.stops.length, "drop")} ·
            leaves {load.startTime}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/print/loads/${load.id}/pick`} target="_blank">
              <Printer aria-hidden />
              Print pick sheet
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/print/loads/${load.id}/run`} target="_blank">
              Run sheet
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/print/loads/${load.id}/delivery`} target="_blank">
              Delivery notes
            </Link>
          </Button>
        </div>
      </div>
      {locked ? (
        <p className="text-sm text-text-muted" role="status">
          This load has left, so its pick sheet can&apos;t be changed.
        </p>
      ) : null}
      <p className="text-sm text-text-muted">Load in this order: the last drop goes on first.</p>
      <ol className="flex min-w-0 flex-col gap-4" aria-label="Load order">
        {load.sections.map((section) => (
          <li key={section.stop.id}>
            <Card className="flex min-w-0 flex-col gap-3 p-4">
              <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-3">
                  <span
                    className="num flex size-control shrink-0 items-center justify-center rounded-full bg-surface-muted text-base font-semibold"
                    aria-hidden
                  >
                    {section.loadPosition}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <h3 className="truncate text-base font-semibold">{section.stop.site.name}</h3>
                    <p className="text-sm text-text-muted">
                      {section.loadPosition === 1
                        ? "Load first"
                        : `Load ${section.loadPosition} of ${load.stops.length}`}{" "}
                      · drop {section.dropNumber} of {load.stops.length}
                      {section.isLastDrop ? " (last drop)" : ""} · {section.stop.site.postcode}
                    </p>
                  </div>
                </div>
              </header>
              {section.orders.map((o) => (
                <div key={o.id} className="flex min-w-0 flex-col">
                  <p className="text-sm">
                    <span className="font-semibold">{o.order_ref}</span> · {o.customer_name}
                    {o.customer_po ? (
                      <span className="text-text-muted"> · PO {o.customer_po}</span>
                    ) : null}
                  </p>
                  <ul className="flex flex-col" aria-label={`Lines for ${o.order_ref}`}>
                    {o.lines.map((l) => {
                      const line = withLocal(l);
                      return (
                        <LineRow
                          key={l.id}
                          line={line}
                          canTick={canTick}
                          locked={locked}
                          onChange={(patch) => change(line, patch)}
                          onShortage={() => {
                            setShortFor(line);
                            setNote("");
                            setNoteError(null);
                          }}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Card>
          </li>
        ))}
      </ol>
      <Modal
        open={Boolean(shortFor)}
        onOpenChange={(o) => !o && setShortFor(null)}
        title="Flag a shortage"
        description={shortFor ? `${shortFor.quantity} × ${shortFor.unitName}` : undefined}
        footer={
          <>
            <Button onClick={() => setShortFor(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (note.trim().length < 2)
                  return setNoteError("Say what's short, e.g. “1 door frame missing”.");
                change(shortFor!, { shortage: true, shortage_note: note.trim() });
                setShortFor(null);
              }}
            >
              Flag shortage
            </Button>
          </>
        }
      >
        <Field
          label="What's short?"
          required
          error={noteError}
          hint="The planner sees this on the load."
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 1 door frame missing"
          />
        </Field>
      </Modal>
    </section>
  );
}

export function WarehouseView({
  data,
  today,
  selectedLoadId,
  canTick,
}: {
  data: SheetData;
  today: string;
  selectedLoadId: string | null;
  canTick: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startNav] = useTransition();
  const selected = data.loads.find((l) => l.id === selectedLoadId) ?? data.loads[0] ?? null;

  function go(patch: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  const shift = (days: number) =>
    go({ date: iso(addDays(fromIsoDate(data.date), days)), load: null });

  return (
    <PageContainer>
      <PageHeader
        title="Warehouse"
        description={`Pick sheets for ${formatDateLong(fromIsoDate(data.date))}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button iconOnly size="lg" aria-label="Previous day" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          size="lg"
          onClick={() => go({ date: null, load: null })}
          disabled={data.date === today}
        >
          Today
        </Button>
        <Button iconOnly size="lg" aria-label="Next day" onClick={() => shift(1)}>
          <ChevronRight aria-hidden />
        </Button>
        <div className="w-popover max-w-full">
          <DatePicker
            aria-label="Choose a day"
            value={fromIsoDate(data.date)}
            onValueChange={(d) => d && go({ date: toIsoDate(d), load: null })}
          />
        </div>
      </div>

      {data.loads.length ? (
        <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
          <nav aria-label="Loads" className="min-w-0 xl:w-popover xl:shrink-0">
            <ul className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-1">
              {data.loads.map((l) => {
                const status = optionFor(LOAD_STATUSES, l.status);
                const current = l.id === selected?.id;
                return (
                  <li key={l.id} className="min-w-0">
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => go({ load: l.id })}
                      className={cn(
                        "flex w-full min-w-0 flex-col gap-3 rounded-lg border bg-surface p-4 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                        current
                          ? "border-accent ring-2 ring-accent"
                          : "border-border hover:bg-surface-muted",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Truck className="size-icon-sm shrink-0 text-text-muted" aria-hidden />
                        <span className="min-w-0 truncate text-base font-semibold">{l.title}</span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={status.tone} size="sm">
                          {status.label}
                        </Badge>
                        <span className="min-w-0 truncate text-sm text-text-muted">
                          {plural(l.stops.length, "drop")} · leaves {l.startTime}
                        </span>
                      </span>
                      <Progress load={l} />
                      {l.totals.shortages ? (
                        <span className="flex items-center gap-1 text-sm font-medium text-warning-fg">
                          <TriangleAlert className="size-icon-sm" aria-hidden />
                          {plural(l.totals.shortages, "shortage")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {selected ? (
            <div className="min-w-0 flex-1">
              <PickSheet key={selected.id} load={selected} canTick={canTick} />
            </div>
          ) : null}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={PackageCheck}
            title="Nothing to pick on this day"
            description="When loads are planned, each gets a pick sheet in load order (last drop first) with tick boxes for picked and loaded."
            action={
              <Button asChild>
                <Link href={`/plan?week=${data.date}`}>
                  <CalendarDays aria-hidden />
                  Open plan
                </Link>
              </Button>
            }
          />
        </Card>
      )}
    </PageContainer>
  );
}
