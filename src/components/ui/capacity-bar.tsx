import { CircleAlert, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent } from "@/lib/format";

export type CapacityLevel = "ok" | "near" | "over";

/** Default share of capacity at which a bar turns amber (organisation setting later). */
export const DEFAULT_NEAR_LIMIT = 0.9;

export function capacityLevel(
  used: number,
  capacity: number,
  nearLimit = DEFAULT_NEAR_LIMIT,
): CapacityLevel {
  if (capacity <= 0) return used > 0 ? "over" : "ok";
  if (used > capacity) return "over";
  if (used / capacity >= nearLimit) return "near";
  return "ok";
}

type CapacityBarProps = {
  /** "Space", "Weight" */
  label: string;
  used: number;
  capacity: number;
  /** Amount about to be added (while dragging), drawn as a lighter segment. */
  pending?: number;
  /** Formats amounts, e.g. formatKg. Defaults to whole numbers. */
  format?: (n: number) => string;
  /** Unit after the numbers when using the default format, e.g. "pallet spaces". */
  unit?: string;
  nearLimit?: number;
  size?: "sm" | "md";
  className?: string;
};

const fill: Record<CapacityLevel, string> = {
  ok: "bg-accent",
  near: "bg-warning",
  over: "bg-danger",
};

const pendingFill: Record<CapacityLevel, string> = {
  ok: "bg-accent opacity-40",
  near: "bg-warning opacity-50",
  over: "bg-danger opacity-50",
};

/**
 * Shows how full a load is. Turns amber near the limit and red over it,
 * including while an order is being dragged on, before it is dropped (9.2).
 * Colour is always paired with an icon and words.
 */
export function CapacityBar({
  label,
  used,
  capacity,
  pending = 0,
  format,
  unit,
  nearLimit = DEFAULT_NEAR_LIMIT,
  size = "md",
  className,
}: CapacityBarProps) {
  const total = used + pending;
  const level = capacityLevel(total, capacity, nearLimit);
  const fmt = format ?? formatNumber;
  const pct = (n: number) => (capacity > 0 ? Math.min(100, (n / capacity) * 100) : n > 0 ? 100 : 0);
  const usedPct = pct(used);
  const pendingPct = Math.max(0, pct(total) - usedPct);

  const statusText =
    level === "over" ? `${fmt(total - capacity)} over` : level === "near" ? "Near limit" : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div
        className={cn(
          "flex min-w-0 items-center justify-between gap-2",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        <span className="truncate text-text-muted">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          {level === "over" ? (
            <OctagonAlert className="size-3 text-danger-fg" aria-hidden />
          ) : level === "near" ? (
            <CircleAlert className="size-3 text-warning-fg" aria-hidden />
          ) : null}
          {statusText ? (
            <span
              className={cn("font-medium", level === "over" ? "text-danger-fg" : "text-warning-fg")}
            >
              {statusText} ·
            </span>
          ) : null}
          <span className="num font-medium text-text">
            {fmt(total)} / {fmt(capacity)}
            {unit && !format ? ` ${unit}` : ""}
          </span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={total}
        aria-valuetext={`${fmt(total)} of ${fmt(capacity)}${unit && !format ? ` ${unit}` : ""} (${formatPercent(capacity > 0 ? total / capacity : 0)})${statusText ? `, ${statusText}` : ""}`}
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-surface-muted",
          size === "sm" ? "h-1" : "h-2",
        )}
      >
        <div
          className={cn("h-full transition-all", fill[level])}
          style={{ width: `${usedPct}%` }}
        />
        {pendingPct > 0 ? (
          <div
            className={cn("h-full transition-all", pendingFill[level])}
            style={{ width: `${pendingPct}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}
