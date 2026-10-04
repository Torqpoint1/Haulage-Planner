"use client";

import { Lightbulb, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PanelSection } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { formatGbp, formatMiles } from "@/lib/format";
import type { PlanData } from "@/lib/planning/types";
import type { LoadAdvice } from "@/lib/suggestions/server";
import {
  addOrderToLoad,
  addStandingOrders,
  loadAdviceAction,
  reorderStops,
  updateLoad,
} from "./actions";
import { addCollection } from "./asset-actions";
import type { LoadView } from "./load-card";
import { OptionsList } from "./options-list";

function Reasons({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((r) => (
        <li key={r} className="text-xs break-words text-text-muted">
          {r}
        </li>
      ))}
    </ul>
  );
}

/**
 * Suggestions for one load (spec 8.2–8.4): a better drop order, orders that
 * could fill spare room, and every delivery option ranked by cost. Each shows
 * why; nothing changes until the planner clicks.
 */
export function LoadAdvicePanel({
  view,
  data,
  locked,
}: {
  view: LoadView;
  data: PlanData;
  locked: boolean;
}) {
  const { load } = view;
  const [advice, setAdvice] = useState<LoadAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, start] = useTransition();
  // Ask again whenever the load itself changes.
  const revision = JSON.stringify([
    load.vehicle_id,
    load.haulier_id,
    load.load_date,
    load.crew_size,
    load.stops.map((s) => [s.id, s.order_ids, s.booking_slot, s.eta_from, s.assets]),
  ]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    startLoading(async () => {
      const result = await loadAdviceAction(load.id);
      if (!live) return;
      if (result.ok) {
        setAdvice(result);
        setError(null);
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [load.id, revision, nonce]);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await work();
      if (r.ok) toast.success(success);
      else toast.error(r.error ?? "That didn't work. Try again.");
    });

  const stopName = (id: string) =>
    data.sites[load.stops.find((s) => s.id === id)?.site_id ?? ""]?.name ?? "Stop";

  if (error) {
    return (
      <PanelSection title="Suggestions">
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-text-muted">
            Suggestions couldn&apos;t be worked out. {error}
          </p>
          <Button size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw aria-hidden />
            Try again
          </Button>
        </div>
      </PanelSection>
    );
  }
  if (!advice) {
    return (
      <PanelSection title="Suggestions">
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Working out suggestions">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </PanelSection>
    );
  }

  return (
    <>
      {!locked && advice.standing ? (
        <PanelSection title={`Standing run: ${advice.standing.runName}`}>
          <div className="flex flex-col gap-3" aria-busy={loading}>
            {advice.standing.orders.length ? (
              <section aria-label="Orders for this run" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Received before the {advice.standing.cutoff} cut-off
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={pending}
                    onClick={() =>
                      run(
                        () =>
                          addStandingOrders(
                            load.id,
                            advice.standing!.orders.map((o) => o.id),
                          ),
                        `${advice.standing!.orders.length === 1 ? "1 order" : `${advice.standing!.orders.length} orders`} added in the run's order`,
                      )
                    }
                  >
                    <Plus aria-hidden />
                    Add all ({advice.standing.orders.length})
                  </Button>
                </div>
                <ul className="flex flex-col gap-2">
                  {advice.standing.orders.map((o) => (
                    <li
                      key={o.id}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {o.order_ref} · {o.site_name}
                      </span>
                      <Reasons items={[o.reason]} />
                      <Button
                        size="sm"
                        className="w-fit"
                        loading={pending}
                        onClick={() =>
                          run(
                            () => addStandingOrders(load.id, [o.id]),
                            `${o.order_ref} added to the load`,
                          )
                        }
                      >
                        <Plus aria-hidden />
                        Add {o.order_ref}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-sm text-text-muted">
                No unplanned orders for this run&apos;s sites arrived before the{" "}
                {advice.standing.cutoff} cut-off.
              </p>
            )}
            {advice.standing.late.length ? (
              <section aria-label="Arrived after the cut-off" className="flex flex-col gap-2">
                <p className="text-sm font-medium">After the cut-off</p>
                <ul className="flex flex-col gap-2">
                  {advice.standing.late.map((o) => (
                    <li
                      key={o.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {o.order_ref} · {o.site_name}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() =>
                          run(
                            () => addStandingOrders(load.id, [o.id]),
                            `${o.order_ref} added to the load`,
                          )
                        }
                      >
                        Add anyway
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </PanelSection>
      ) : null}
      {!locked && (advice.stopOrder || advice.gaps.length || advice.collections.length) ? (
        <PanelSection title="Suggestions">
          <div className="flex flex-col gap-3" aria-busy={loading}>
            {advice.stopOrder ? (
              <section
                aria-label="Suggested drop order"
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="size-icon-sm shrink-0 text-info-fg" aria-hidden />
                  Suggested drop order
                </p>
                <ol className="flex flex-col gap-1 pl-6 text-sm">
                  {advice.stopOrder.stopIds.map((id, i) => (
                    <li key={id} className="truncate">
                      <span className="num text-text-subtle">{i + 1}</span> {stopName(id)}
                    </li>
                  ))}
                </ol>
                <Reasons items={advice.stopOrder.reasons} />
                <Button
                  size="sm"
                  className="w-fit"
                  loading={pending}
                  onClick={() =>
                    run(
                      () => reorderStops(load.id, advice.stopOrder!.stopIds),
                      "Drop order updated",
                    )
                  }
                >
                  Use this order
                </Button>
              </section>
            ) : null}
            {advice.gaps.length ? (
              <section aria-label="Fill the gaps" className="flex flex-col gap-2">
                <p className="text-sm font-medium">Room to spare: orders nearby</p>
                <ul className="flex flex-col gap-2">
                  {advice.gaps.map((g) => (
                    <li
                      key={g.orderId}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3"
                    >
                      <div className="flex min-w-0 items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {g.orderRef} · {g.siteName}
                        </span>
                        <span className="num shrink-0 text-xs text-text-muted">{g.timing}</span>
                      </div>
                      <p className="num text-xs">
                        Adds {formatMiles(g.extraMiles)}
                        {g.extraCost != null ? ` (${formatGbp(g.extraCost)} est.)` : ""}
                        {g.saving != null && g.saving > 0
                          ? `; saves about ${formatGbp(g.saving)} against a separate trip`
                          : ""}
                      </p>
                      <Reasons items={g.reasons} />
                      <Button
                        size="sm"
                        className="w-fit"
                        loading={pending}
                        onClick={() =>
                          run(
                            () => addOrderToLoad(load.id, g.orderId),
                            `${g.orderRef} added to the load`,
                          )
                        }
                      >
                        <Plus aria-hidden />
                        Add {g.orderRef}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {advice.collections.length ? (
              <section aria-label="Asset collections" className="flex flex-col gap-2">
                <p className="text-sm font-medium">Overdue assets to collect nearby</p>
                <ul className="flex flex-col gap-2">
                  {advice.collections.map((c) => (
                    <li
                      key={c.siteId}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3"
                    >
                      <div className="flex min-w-0 items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {c.siteName} · {c.postcode}
                        </span>
                        <span className="num shrink-0 text-xs text-text-muted">
                          {c.onRoute
                            ? "already a stop"
                            : `+${formatMiles(c.extraMiles)}${c.estimate ? " est." : ""}`}
                        </span>
                      </div>
                      <p className="text-xs">{c.assets.map((a) => a.label).join(", ")}</p>
                      <Reasons items={c.reasons} />
                      <Button
                        size="sm"
                        className="w-fit"
                        loading={pending}
                        onClick={() =>
                          run(
                            () =>
                              addCollection(
                                load.id,
                                c.assets.map((a) => a.id),
                              ),
                            `Collection from ${c.siteName} added`,
                          )
                        }
                      >
                        <Plus aria-hidden />
                        {c.onRoute ? "Collect at this stop" : "Add collection stop"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </PanelSection>
      ) : null}
      <PanelSection title="Cheapest option">
        <OptionsList
          options={advice.options}
          pending={pending}
          onUse={
            locked
              ? undefined
              : (o) =>
                  run(
                    () =>
                      updateLoad(
                        load.id,
                        o.kind === "vehicle" ? { vehicle_id: o.id } : { haulier_id: o.id },
                      ),
                    `Now using ${o.name}`,
                  )
          }
        />
      </PanelSection>
    </>
  );
}
