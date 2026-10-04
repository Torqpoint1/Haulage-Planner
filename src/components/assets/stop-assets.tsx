"use client";

import { ArrowDownToLine, ArrowUpFromLine, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { addCollection, addDrops, removeStopAsset } from "@/app/(app)/plan/asset-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatIsoDate } from "@/lib/format";
import { AssetPicker, type PickableAsset } from "./asset-picker";

export type StopAssetView = {
  id: string;
  label: string;
  direction: "drop" | "collect";
  outcome: "pending" | "done" | "not_done";
};

export type AssetChoice = PickableAsset & { dueBack?: string | null };

const OUTCOME_LABEL = {
  drop: { done: "dropped", not_done: "came back" },
  collect: { done: "collected", not_done: "not collected" },
} as const;

/**
 * Returnable assets on one stop (spec 6.11): what goes out with the delivery
 * and what comes back. Used on the plan's load panel and the warehouse sheet.
 */
export function StopAssets({
  loadId,
  stopId,
  siteName,
  hasOrders,
  assets,
  depotAssets,
  siteAssets,
  canDrop,
  canCollect,
}: {
  loadId: string;
  stopId: string;
  siteName: string;
  hasOrders: boolean;
  assets: StopAssetView[];
  /** At the depot and free: can be sent with this delivery. */
  depotAssets: AssetChoice[];
  /** At this site and not yet planned for collection. */
  siteAssets: AssetChoice[];
  canDrop: boolean;
  canCollect: boolean;
}) {
  const [picking, setPicking] = useState<"drop" | "collect" | null>(null);
  const [pending, start] = useTransition();
  const drops = assets.filter((a) => a.direction === "drop");
  const collects = assets.filter((a) => a.direction === "collect");
  if (!assets.length && !(canDrop && hasOrders) && !(canCollect && siteAssets.length)) return null;

  const row = (a: StopAssetView, removable: boolean) => (
    <li key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
      <span className="min-w-0 truncate">{a.label}</span>
      {a.outcome !== "pending" ? (
        <Badge tone={a.outcome === "done" ? "success" : "neutral"} size="sm">
          {OUTCOME_LABEL[a.direction][a.outcome]}
        </Badge>
      ) : null}
      {removable && a.outcome === "pending" ? (
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          className="ml-auto"
          aria-label={`Take ${a.label} off this stop`}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await removeStopAsset(stopId, a.id, a.direction);
              if (!r.ok) toast.error(r.error);
            })
          }
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </li>
  );

  return (
    <section
      aria-label={`Returnable assets at ${siteName}`}
      className="flex min-w-0 flex-col gap-2 rounded-md bg-surface-muted p-3"
    >
      {drops.length ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1 text-xs font-semibold text-text-muted">
            <ArrowDownToLine className="size-icon-sm" aria-hidden /> Send with this delivery
          </p>
          <ul className="flex flex-col gap-1">{drops.map((a) => row(a, canDrop))}</ul>
        </div>
      ) : null}
      {collects.length ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-1 text-xs font-semibold text-text-muted">
            <ArrowUpFromLine className="size-icon-sm" aria-hidden /> Collect
          </p>
          <ul className="flex flex-col gap-1">{collects.map((a) => row(a, canCollect))}</ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canDrop && hasOrders ? (
          <Button size="sm" onClick={() => setPicking("drop")}>
            <Plus aria-hidden />
            Send assets
          </Button>
        ) : null}
        {canCollect && siteAssets.length ? (
          <Button size="sm" onClick={() => setPicking("collect")}>
            <Plus aria-hidden />
            Collect assets ({siteAssets.length} here)
          </Button>
        ) : null}
      </div>
      <AssetPicker
        open={picking === "drop"}
        onOpenChange={(o) => !o && setPicking(null)}
        title="Send assets"
        description={`Returnable assets at the depot to go with the delivery to ${siteName}.`}
        assets={depotAssets}
        confirmLabel="Send"
        emptyText="No returnable assets are at the depot. Add them under History → Assets."
        onConfirm={async (ids) => {
          const r = await addDrops(stopId, ids);
          if (!r.ok) toast.error(r.error);
          return r.ok;
        }}
      />
      <AssetPicker
        open={picking === "collect"}
        onOpenChange={(o) => !o && setPicking(null)}
        title={`Collect from ${siteName}`}
        assets={siteAssets.map((a) => ({
          ...a,
          hint: a.dueBack ? `Due back ${formatIsoDate(a.dueBack)}` : a.hint,
        }))}
        confirmLabel="Collect"
        emptyText="Nothing to collect here."
        onConfirm={async (ids) => {
          const r = await addCollection(loadId, ids);
          if (!r.ok) toast.error(r.error);
          return r.ok;
        }}
      />
    </section>
  );
}
