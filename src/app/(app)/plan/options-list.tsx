"use client";

import { Ban, ChevronDown, ChevronRight, Handshake, Truck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatGbp } from "@/lib/format";
import type { DeliveryOption } from "@/lib/suggestions/options";

/**
 * Every way to deliver, cheapest first (spec 8.2). Options that would fail a
 * blocking check sit at the bottom, greyed, with the reason. Tap one for its
 * cost breakdown; estimates are labelled.
 */
export function OptionsList({
  options,
  onUse,
  pending,
  label = "Delivery options",
}: {
  options: DeliveryOption[];
  onUse?: (option: DeliveryOption) => void;
  pending?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!options.length)
    return <p className="text-sm text-text-muted">Add an order to compare options.</p>;
  const cheapest = options.find((o) => o.valid)?.key;

  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {options.map((o) => {
        const expanded = open === o.key;
        const Icon = o.kind === "vehicle" ? Truck : Handshake;
        return (
          <li
            key={o.key}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-md border p-3",
              o.valid ? "border-border bg-surface" : "border-border bg-surface-muted",
              o.current && "border-accent",
            )}
          >
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : o.key)}
              className="flex min-w-0 items-start gap-2 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              {expanded ? (
                <ChevronDown className="mt-px size-icon-sm shrink-0 text-text-subtle" aria-hidden />
              ) : (
                <ChevronRight
                  className="mt-px size-icon-sm shrink-0 text-text-subtle"
                  aria-hidden
                />
              )}
              <Icon
                className={cn(
                  "mt-px size-icon-sm shrink-0",
                  o.valid ? "text-text-muted" : "text-text-subtle",
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate text-sm font-medium", !o.valid && "text-text-muted")}>
                  {o.name}
                </span>
                <span className="truncate text-xs text-text-muted">{o.detail}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {o.cost != null ? (
                  <span className={cn("num text-sm font-semibold", !o.valid && "text-text-muted")}>
                    {formatGbp(o.cost)}
                    {o.estimate ? <span className="font-normal text-text-muted"> est.</span> : null}
                  </span>
                ) : null}
                <span className="flex flex-wrap justify-end gap-1">
                  {o.current ? <Badge size="sm">Current</Badge> : null}
                  {o.key === cheapest ? (
                    <Badge tone="success" size="sm">
                      Cheapest
                    </Badge>
                  ) : null}
                </span>
              </span>
            </button>
            {!o.valid ? (
              <ul className="flex flex-col gap-1 pl-6" aria-label={`Why ${o.name} can't`}>
                {o.reasons.map((r) => (
                  <li
                    key={r}
                    className="flex items-start gap-1 text-xs break-words text-text-muted"
                  >
                    <Ban className="mt-px size-3 shrink-0" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {expanded ? (
              <div className="flex flex-col gap-2 pl-6">
                {o.breakdown.length ? (
                  <dl className="flex flex-col gap-1">
                    {o.breakdown.map((l) => (
                      <div
                        key={l.label}
                        className="flex min-w-0 items-baseline justify-between gap-3 text-xs"
                      >
                        <dt className="min-w-0 break-words text-text-muted">{l.label}</dt>
                        <dd className="num shrink-0">{formatGbp(l.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {o.estimate && o.cost != null ? (
                  <p className="text-xs text-text-muted">
                    Estimate: running costs from your vehicle settings and the estimated time.
                  </p>
                ) : null}
                {o.notes.map((n) => (
                  <p key={n} className="text-xs text-text-muted">
                    {n}
                  </p>
                ))}
              </div>
            ) : null}
            {onUse && o.valid && !o.current ? (
              <Button size="sm" className="ml-6 w-fit" loading={pending} onClick={() => onUse(o)}>
                Use {o.name}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
