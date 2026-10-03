"use client";

import {
  useDraggable,
  useDroppable,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ReadinessBadge } from "@/components/orders/badges";
import { EntityForm, FieldRow, FormField } from "@/components/settings/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PanelSection, SidePanel } from "@/components/ui/side-panel";
import { toast } from "@/components/ui/toast";
import { WarningItem } from "@/components/ui/warning-item";
import { cn } from "@/lib/cn";
import { formatDateLong, formatDateTime, formatGbp, formatMiles, fromIsoDate } from "@/lib/format";
import { optionFor } from "@/lib/orders/options";
import { driverNames, loadTitle, unitsText } from "@/lib/planning/labels";
import {
  CONFIRMATION_METHODS,
  LOAD_STATUSES,
  type LoadStatus,
  type PlanData,
  type PlanStop,
} from "@/lib/planning/types";
import { unresolvedBlocking, type DecidedWarning } from "@/lib/rules";
import { fromMinutes } from "@/lib/rules/time";
import type { WarningFix } from "@/lib/rules/types";
import {
  clearDecision,
  deleteLoad,
  dismissWarning,
  overrideWarning,
  removeOrderFromLoad,
  reorderStops,
  saveStop,
  setLoadStatus,
} from "./actions";
import { LoadAdvicePanel } from "./load-advice";
import { PickingLine, SpaceBar, WeightBar, type LoadView } from "./load-card";
import { OutcomeBadge, PodModal } from "./pod-modal";

/** The next step for each status, and the way back where there is one. */
const NEXT: Partial<Record<LoadStatus, { to: LoadStatus; label: string }>> = {
  draft: { to: "confirmed", label: "Confirm load" },
  planned: { to: "confirmed", label: "Confirm load" },
  confirmed: { to: "loading", label: "Start loading" },
  loading: { to: "out", label: "Mark as out" },
  out: { to: "complete", label: "Mark as complete" },
};
const BACK: Partial<Record<LoadStatus, { to: LoadStatus; label: string }>> = {
  confirmed: { to: "planned", label: "Back to planned" },
  loading: { to: "confirmed", label: "Back to confirmed" },
};

export type StopFocus = { stopId: string; field: string } | null;

function StopForm({
  stop,
  focusField,
  onDone,
}: {
  stop: PlanStop;
  focusField: string | null;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(stop.confirmed);
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `stop-form-${stop.id}`;

  useEffect(() => {
    const name =
      focusField === "booking"
        ? "booking_ref"
        : focusField === "eta"
          ? "eta_from"
          : focusField === "confirmation"
            ? "confirmed"
            : null;
    if (!name) return;
    const el = formRef.current?.querySelector<HTMLElement>(
      `[name="${name}"], #${formId}-confirmed`,
    );
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  }, [focusField, formId]);

  return (
    <div ref={formRef}>
      <EntityForm
        id={formId}
        action={(fd) => {
          fd.set("confirmed", confirmed ? "on" : "");
          return saveStop(stop.id, fd);
        }}
        onPendingChange={setSaving}
        onSaved={() => {
          toast.success("Stop saved");
          onDone();
        }}
        className="flex flex-col gap-4"
      >
        <FieldRow>
          <FormField name="eta_from" label="Arrive from" hint="hh:mm">
            <Input
              name="eta_from"
              defaultValue={stop.eta_from ?? ""}
              inputMode="numeric"
              className="num"
            />
          </FormField>
          <FormField name="eta_to" label="Arrive by" hint="hh:mm">
            <Input
              name="eta_to"
              defaultValue={stop.eta_to ?? ""}
              inputMode="numeric"
              className="num"
            />
          </FormField>
          <FormField name="booking_ref" label="Booking ref">
            <Input name="booking_ref" defaultValue={stop.booking_ref} autoComplete="off" />
          </FormField>
          <FormField name="booking_slot" label="Booking slot" hint="hh:mm">
            <Input
              name="booking_slot"
              defaultValue={stop.booking_slot ?? ""}
              inputMode="numeric"
              className="num"
            />
          </FormField>
        </FieldRow>
        <Checkbox
          id={`${formId}-confirmed`}
          label="Delivery confirmed with the customer"
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        {confirmed ? (
          <>
            <FieldRow>
              <FormField name="confirmed_by" label="Confirmed by">
                <Input name="confirmed_by" defaultValue={stop.confirmed_by} placeholder="Name" />
              </FormField>
              <FormField name="confirmation_method" label="How">
                <Select
                  name="confirmation_method"
                  options={[...CONFIRMATION_METHODS]}
                  defaultValue={stop.confirmation_method ?? undefined}
                  placeholder="Choose…"
                />
              </FormField>
            </FieldRow>
            <FormField name="confirmation_note" label="Note">
              <Textarea name="confirmation_note" defaultValue={stop.confirmation_note} />
            </FormField>
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button size="sm" type="submit" variant="primary" loading={saving}>
            Save stop
          </Button>
        </div>
      </EntityForm>
    </div>
  );
}

function StopRow({
  stop,
  index,
  count,
  view,
  data,
  canEdit,
  locked,
  expected,
  focus,
  onMove,
  onFocusDone,
}: {
  stop: PlanStop;
  index: number;
  count: number;
  view: LoadView;
  data: PlanData;
  canEdit: boolean;
  locked: boolean;
  expected: number | null;
  focus: StopFocus;
  onMove: (from: number, to: number) => void;
  onFocusDone: () => void;
}) {
  const site = data.sites[stop.site_id];
  const orders = stop.order_ids.map((id) => data.orders[id]).filter(Boolean);
  const [open, setOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [pending, start] = useTransition();
  const focused = focus?.stopId === stop.id;
  const editable = canEdit && !locked;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `stop:${stop.id}`,
    disabled: !editable,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `stopslot:${index}`,
    disabled: !editable,
  });
  const stopWarnings = view.warnings.filter(
    (w) => w.entity.type === "stop" && w.entity.id === stop.id && !w.decision,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fix asked for this stop's form
    if (focused) setOpen(true);
  }, [focused]);

  return (
    <li
      ref={setDropRef}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md border bg-surface p-3",
        isOver ? "border-accent" : "border-border",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {editable ? (
          <button
            type="button"
            ref={setDragRef}
            className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-text-subtle hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            aria-label={`Drag stop ${index + 1} to reorder`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-icon-sm" aria-hidden />
          </button>
        ) : null}
        <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {site ? (
            <Link
              href={`/customers/${site.customer_id}/sites/${site.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {site.name}
            </Link>
          ) : null}
          <span className="truncate text-xs text-text-muted">
            {site?.postcode}
            {expected != null
              ? ` · ${stop.booking_slot || stop.eta_from ? "planned" : "est."} ${fromMinutes(expected)}`
              : ""}
          </span>
        </div>
        {editable ? (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`Move stop ${index + 1} up`}
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={`Move stop ${index + 1} down`}
              disabled={index === count - 1}
              onClick={() => onMove(index, index + 1)}
            >
              <ArrowDown aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>

      {stop.status !== "pending" ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <OutcomeBadge status={stop.status} />
          <Button size="sm" onClick={() => setPodOpen(true)}>
            Proof of delivery
          </Button>
          <PodModal
            stopId={stop.id}
            title={`Stop ${index + 1}: ${site?.name ?? "Site"}`}
            canEdit={canEdit}
            open={podOpen}
            onOpenChange={setPodOpen}
          />
        </div>
      ) : null}

      <ul className="flex min-w-0 flex-col gap-1">
        {orders.map((o) => (
          <li key={o.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
              {o.order_ref}
            </Link>
            <span className="text-text-muted">{unitsText([o], data.unitTypes)}</span>
            <ReadinessBadge value={o.readiness} />
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                aria-label={`Take ${o.order_ref} off this load`}
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeOrderFromLoad(o.id);
                    if (r.ok) toast.success(`${o.order_ref} is back in unplanned orders`);
                    else toast.error(r.error);
                  })
                }
                className="ml-auto"
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
        {stop.booking_ref ? (
          <Badge size="sm">
            Booking {stop.booking_ref}
            {stop.booking_slot ? ` at ${stop.booking_slot}` : ""}
          </Badge>
        ) : null}
        {stop.confirmed ? (
          <Badge tone="success" size="sm">
            Confirmed{stop.confirmed_by ? ` by ${stop.confirmed_by}` : ""}
          </Badge>
        ) : (
          <Badge size="sm">Not confirmed</Badge>
        )}
        {stopWarnings.length ? (
          <span>{stopWarnings.length === 1 ? "1 warning" : `${stopWarnings.length} warnings`}</span>
        ) : null}
      </div>

      {editable ? (
        <button
          type="button"
          className="flex w-fit items-center gap-1 text-sm font-medium text-accent-text hover:underline"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="size-icon-sm" aria-hidden />
          ) : (
            <ChevronRight className="size-icon-sm" aria-hidden />
          )}
          Booking and confirmation
        </button>
      ) : stop.confirmed && (stop.confirmation_method || stop.confirmed_at) ? (
        <p className="text-xs text-text-muted">
          {stop.confirmation_method
            ? `By ${optionFor(CONFIRMATION_METHODS, stop.confirmation_method).label.toLowerCase()}`
            : "Confirmed"}
          {stop.confirmed_at ? ` on ${formatDateTime(stop.confirmed_at)}` : ""}
        </p>
      ) : null}
      {open ? (
        <StopForm
          stop={stop}
          focusField={focused ? focus!.field : null}
          onDone={() => {
            setOpen(false);
            onFocusDone();
          }}
        />
      ) : null}
    </li>
  );
}

export function LoadPanel({
  view,
  data,
  open,
  onOpenChange,
  canEdit,
  canApprove,
  canOverride,
  onFix,
  onEdit,
  focus,
  onFocusDone,
}: {
  view: LoadView | null;
  data: PlanData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  canApprove: boolean;
  canOverride: boolean;
  onFix: (fix: WarningFix, view: LoadView) => void;
  onEdit: () => void;
  focus: StopFocus;
  onFocusDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  if (!view) return null;
  const { load, metrics, warnings } = view;
  const { title, subtitle } = loadTitle(load, data);
  const status = optionFor(LOAD_STATUSES, load.status);
  const locked = ["loading", "out", "complete"].includes(load.status);
  const blocking = unresolvedBlocking(warnings);
  const shown = warnings.filter((w) => w.decision?.kind !== "dismiss");
  const dismissed = warnings.filter((w) => w.decision?.kind === "dismiss");
  const near = data.thresholds.capacity_near_limit_pct / 100;
  const depot = data.depots.find((d) => d.id === load.depot_id);
  const next = NEXT[load.status];
  const back = BACK[load.status];

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await work();
      if (r.ok) toast.success(success);
      else toast.error(r.error ?? "Something went wrong. Try again.");
    });

  const decision = (w: DecidedWarning) => ({
    loadId: load.id,
    key: w.key,
    code: w.code,
    entityType: w.entity.type,
    entityId: w.entity.id,
  });

  function move(from: number, to: number) {
    if (to < 0 || to >= load.stops.length || from === to) return;
    const ids = load.stops.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    run(() => reorderStops(load.id, ids), "Drop order updated");
  }

  function onDragEnd(e: DragEndEvent) {
    const stopId = String(e.active.id).replace("stop:", "");
    const over = e.over ? Number(String(e.over.id).replace("stopslot:", "")) : null;
    const from = load.stops.findIndex((s) => s.id === stopId);
    if (over != null && from >= 0) move(from, over);
  }

  const estimateFor = (stopId: string) =>
    metrics.run.stops.find((s) => s.stopId === stopId)?.expected ?? null;

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{formatDateLong(fromIsoDate(load.load_date))}</span>
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        </span>
      }
      footer={
        canApprove && (next || back) ? (
          <div className="flex w-full flex-col gap-2">
            {next?.to === "confirmed" && blocking.length ? (
              <p className="text-sm text-danger-fg" role="status">
                {blocking.length === 1
                  ? "1 blocking warning"
                  : `${blocking.length} blocking warnings`}{" "}
                to fix or override before confirming.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {back ? (
                <Button
                  loading={pending}
                  onClick={() =>
                    run(
                      () => setLoadStatus(load.id, back.to),
                      `Load ${optionFor(LOAD_STATUSES, back.to).label.toLowerCase()}`,
                    )
                  }
                >
                  {back.label}
                </Button>
              ) : null}
              {next ? (
                <Button
                  variant="primary"
                  loading={pending}
                  disabled={next.to === "confirmed" && (blocking.length > 0 || !load.stops.length)}
                  onClick={() =>
                    run(
                      () => setLoadStatus(load.id, next.to),
                      `Load ${optionFor(LOAD_STATUSES, next.to).label.toLowerCase()}`,
                    )
                  }
                >
                  {next.label}
                </Button>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <PanelSection title="Summary">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            {subtitle}
            {depot ? ` · from ${depot.name} at ${load.start_time}` : ""}
          </p>
          {driverNames(load, data) ? (
            <p className="text-sm">
              {driverNames(load, data)}
              {load.crew_size > 1 ? ` · crew of ${load.crew_size}` : ""}
            </p>
          ) : load.vehicle_id ? (
            <p className="text-sm text-text-muted">
              No driver yet{load.crew_size > 1 ? ` · crew of ${load.crew_size}` : ""}
            </p>
          ) : null}
          <SpaceBar metrics={metrics} nearLimit={near} size="md" />
          <WeightBar metrics={metrics} nearLimit={near} size="md" />
          {metrics.run.miles != null && load.stops.length ? (
            <p className="num text-sm text-text-muted">
              About {formatMiles(metrics.run.miles)}
              {metrics.run.dutyHours != null
                ? ` · ${metrics.run.dutyHours.toFixed(1)} hours on duty`
                : ""}
              {metrics.costEstimate != null ? ` · ${formatGbp(metrics.costEstimate)}` : ""}
              <span className="block text-xs">
                {metrics.run.roadDistances
                  ? "Road distances and HGV driving times; cost is an estimate from your running costs."
                  : "Estimate from straight-line distances × 1.3; road routing isn't available right now."}
              </span>
            </p>
          ) : null}
          <PickingLine progress={data.picking[load.id]} />
          {load.stops.length ? (
            <nav aria-label="Print" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Printer className="size-icon-sm text-text-muted" aria-hidden />
              {(
                [
                  ["pick", "Pick sheet"],
                  ["run", "Run sheet"],
                  ["delivery", "Delivery notes"],
                ] as const
              ).map(([sheet, label]) => (
                <Link
                  key={sheet}
                  href={`/print/loads/${load.id}/${sheet}`}
                  target="_blank"
                  className="font-medium text-accent-text hover:underline"
                >
                  {label}
                </Link>
              ))}
            </nav>
          ) : null}
          {data.picking[load.id]?.shortages.length ? (
            <ul className="flex flex-col gap-1" aria-label="Shortages">
              {data.picking[load.id].shortages.map((sh, i) => (
                <li key={i} className="text-sm break-words text-warning-fg">
                  <span className="font-medium">{sh.orderRef}:</span> {sh.note}
                </li>
              ))}
            </ul>
          ) : null}
          {load.notes ? (
            <p className="text-sm break-words whitespace-pre-line">{load.notes}</p>
          ) : null}
          {canEdit && !locked ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onEdit}>
                <Pencil aria-hidden />
                Edit load
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Delete load
              </Button>
            </div>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title={`Warnings${shown.length ? ` (${shown.length})` : ""}`}>
        {shown.length ? (
          <ul className="flex flex-col gap-2" aria-label="Warnings">
            {shown.map((w) => (
              <li key={w.key}>
                <WarningItem
                  warning={w}
                  overridden={
                    w.decision?.kind === "override"
                      ? { by: w.decision.by, reason: w.decision.reason }
                      : undefined
                  }
                  onFix={canEdit && !locked ? (fix) => onFix(fix, view) : undefined}
                  onOverride={
                    canOverride && !locked
                      ? (reason) =>
                          run(() => overrideWarning(decision(w), reason), "Override recorded")
                      : undefined
                  }
                  onDismiss={
                    canEdit && !locked
                      ? () =>
                          run(() => dismissWarning(decision(w)), "Warning dismissed for this load")
                      : undefined
                  }
                />
                {w.decision?.kind === "override" && canOverride && !locked ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => run(() => clearDecision(load.id, w.key), "Override removed")}
                  >
                    Remove override
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-success-fg">No warnings for this load.</p>
        )}
        {dismissed.length ? (
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              className="w-fit text-sm text-text-muted hover:underline"
              onClick={() => setShowDismissed((s) => !s)}
            >
              {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
            </button>
            {showDismissed
              ? dismissed.map((w) => (
                  <div
                    key={w.key}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-text-muted">
                      {w.title} · dismissed by {w.decision!.by}
                    </span>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() => clearDecision(load.id, w.key), "Warning shown again")
                        }
                      >
                        Show again
                      </Button>
                    ) : null}
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </PanelSection>

      <PanelSection title={`Stops${load.stops.length ? ` (${load.stops.length})` : ""}`}>
        {load.stops.length ? (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <ol className="flex flex-col gap-2" aria-label="Stops in drop order">
              {load.stops.map((s, i) => (
                <StopRow
                  key={s.id}
                  stop={s}
                  index={i}
                  count={load.stops.length}
                  view={view}
                  data={data}
                  canEdit={canEdit}
                  locked={locked}
                  expected={estimateFor(s.id)}
                  focus={focus}
                  onMove={move}
                  onFocusDone={onFocusDone}
                />
              ))}
            </ol>
            <p className="mt-2 text-xs text-text-muted">
              The warehouse loads in reverse: last drop goes on first.
            </p>
          </DndContext>
        ) : (
          <p className="text-sm text-text-muted">
            No stops yet. Drag orders onto this load, or use “Add to load” on an order.
          </p>
        )}
      </PanelSection>

      {canEdit ? <LoadAdvicePanel view={view} data={data} locked={locked} /> : null}

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this load?"
        description="Its orders go back to unplanned. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep load</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteLoad(load.id);
                  setConfirmDelete(false);
                  if (r.ok) {
                    toast.success("Load deleted");
                    onOpenChange(false);
                  } else toast.error(r.error);
                })
              }
            >
              Delete load
            </Button>
          </>
        }
      />
    </SidePanel>
  );
}
