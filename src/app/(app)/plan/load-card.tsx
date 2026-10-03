"use client";

import { useDroppable } from "@dnd-kit/core";
import { Truck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { WarningsBadge } from "@/components/ui/warning-item";
import { cn } from "@/lib/cn";
import { formatGbp, formatKg, formatMiles } from "@/lib/format";
import type { LoadMetrics } from "@/lib/planning/build";
import { driverNames, loadTitle } from "@/lib/planning/labels";
import { LOAD_STATUSES, type PlanData, type PlanLoad } from "@/lib/planning/types";
import type { DecidedWarning } from "@/lib/rules";
import { optionFor } from "@/lib/orders/options";

export type LoadView = {
  load: PlanLoad;
  metrics: LoadMetrics;
  warnings: DecidedWarning[];
};

/** Counts for the badge: dismissed warnings drop out; overridden ones don't block. */
export function warningCounts(warnings: DecidedWarning[]) {
  const live = warnings.filter((w) => !w.decision);
  return {
    blocking: live.filter((w) => w.severity === "blocking").length,
    check: live.filter((w) => w.severity === "check").length,
    info: live.filter((w) => w.severity === "info").length,
  };
}

export function SpaceBar({
  metrics,
  preview,
  nearLimit,
  size = "sm",
}: {
  metrics: LoadMetrics;
  preview?: LoadMetrics | null;
  nearLimit: number;
  size?: "sm" | "md";
}) {
  const space = metrics.space;
  if (!space) return null;
  const next = preview?.space ?? null;
  if (space.units && (!next || next.units)) {
    return (
      <CapacityBar
        label="Space"
        used={space.units.used}
        pending={next?.units ? next.units.used - space.units.used : 0}
        capacity={space.units.max}
        unit={space.units.code}
        nearLimit={nearLimit}
        size={size}
      />
    );
  }
  const pct = (s: number) => Math.round(s * 100);
  return (
    <CapacityBar
      label="Space"
      used={pct(space.share)}
      pending={next ? pct(next.share) - pct(space.share) : 0}
      capacity={100}
      format={(n) => `${n}%`}
      nearLimit={nearLimit}
      size={size}
    />
  );
}

export function WeightBar({
  metrics,
  preview,
  nearLimit,
  size = "sm",
}: {
  metrics: LoadMetrics;
  preview?: LoadMetrics | null;
  nearLimit: number;
  size?: "sm" | "md";
}) {
  if (metrics.payloadKg == null) return null;
  return (
    <CapacityBar
      label="Weight"
      used={Math.round(metrics.weightKg)}
      pending={preview ? Math.round(preview.weightKg - metrics.weightKg) : 0}
      capacity={metrics.payloadKg}
      format={formatKg}
      nearLimit={nearLimit}
      size={size}
    />
  );
}

export function LoadCard({
  view,
  data,
  preview,
  selected,
  dropEnabled,
  onOpen,
}: {
  view: LoadView;
  data: PlanData;
  /** Metrics as if the dragged order were dropped here. */
  preview: LoadMetrics | null;
  selected: boolean;
  dropEnabled: boolean;
  onOpen: () => void;
}) {
  const { load, metrics, warnings } = view;
  const locked = ["loading", "out", "complete"].includes(load.status);
  const { setNodeRef, isOver } = useDroppable({
    id: `load:${load.id}`,
    disabled: !dropEnabled || locked,
  });
  const { title, subtitle } = loadTitle(load, data);
  const status = optionFor(LOAD_STATUSES, load.status);
  const drivers = driverNames(load, data);
  const near = data.thresholds.capacity_near_limit_pct / 100;
  const stops = load.stops;
  const run = metrics.run;

  return (
    <article
      ref={setNodeRef}
      aria-label={`${title} load`}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-surface transition-colors",
        selected ? "border-accent ring-2 ring-accent" : "border-border",
        isOver && "border-accent bg-accent-subtle",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-col gap-3 rounded-lg p-3 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <Truck className="size-icon-sm shrink-0 text-text-muted" aria-hidden />
            <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={status.tone} size="sm">
              {status.label}
            </Badge>
            <span className="min-w-0 truncate text-xs text-text-muted">{subtitle}</span>
          </div>
        </div>

        {drivers ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
            <User className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{drivers}</span>
            {load.crew_size > 1 ? <span className="shrink-0">· crew {load.crew_size}</span> : null}
          </span>
        ) : null}

        {stops.length ? (
          <ol className="flex min-w-0 flex-col gap-1" aria-label="Stops in order">
            {stops.map((s) => {
              const site = data.sites[s.site_id];
              return (
                <li key={s.id} className="flex min-w-0 items-baseline gap-2 text-xs">
                  <span className="num w-4 shrink-0 text-text-subtle">{s.sequence}</span>
                  <span className="min-w-0 truncate">{site?.name ?? "Site"}</span>
                  <span className="shrink-0 text-text-subtle">{site?.postcode.split(" ")[0]}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-text-subtle">
            {dropEnabled && !locked ? "Drag orders here, or use “Add to load”." : "No stops yet."}
          </p>
        )}

        {metrics.space || metrics.payloadKg != null ? (
          <div className="flex flex-col gap-2">
            <SpaceBar metrics={metrics} preview={preview} nearLimit={near} />
            <WeightBar metrics={metrics} preview={preview} nearLimit={near} />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <WarningsBadge counts={warningCounts(warnings)} />
          {stops.length && run.miles != null ? (
            <span className="num text-xs text-text-muted">
              {formatMiles(run.miles)}
              {metrics.costEstimate != null
                ? ` · ${formatGbp(metrics.costEstimate, { whole: true })}`
                : ""}{" "}
              est.
            </span>
          ) : null}
        </div>
      </button>
    </article>
  );
}
