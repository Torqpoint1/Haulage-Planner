"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { PlanData } from "@/lib/planning/types";
import type { LoadProposal } from "@/lib/suggestions/suggest-loads";
import { acceptProposal } from "./actions";

/**
 * A suggested load, drawn as a ghost card on the board (spec 8.1). It shows
 * its reasoning and changes nothing until the planner accepts or edits it.
 */
export function ProposalCard({
  proposal,
  data,
  onDone,
  onEdit,
}: {
  proposal: LoadProposal;
  data: PlanData;
  /** The proposal was accepted or dismissed: take it off the board. */
  onDone: () => void;
  /** Accepted to edit further: open the new load. */
  onEdit: (loadId: string) => void;
}) {
  const [pending, start] = useTransition();
  const [showWhy, setShowWhy] = useState(false);
  const vehicle = data.vehicles.find((v) => v.id === proposal.vehicleId);
  const orders = proposal.orderIds.map((id) => data.orders[id]).filter(Boolean);
  const name = vehicle?.name ?? "Vehicle";

  function accept(thenEdit: boolean) {
    start(async () => {
      const r = await acceptProposal(proposal);
      if (r.ok && r.id) {
        toast.success(`Load created on ${name}`);
        onDone();
        if (thenEdit) onEdit(r.id);
      } else toast.error(r.error ?? "That suggestion couldn't be used. Suggest loads again.");
    });
  }

  return (
    <article
      aria-label={`Suggested load on ${name}`}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-accent bg-accent-subtle p-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Badge tone="info" size="sm" icon={<Sparkles aria-hidden />} className="w-fit">
          Suggested
        </Badge>
        <span className="truncate text-sm font-semibold">{name}</span>
        <p className="text-xs break-words text-text-muted">{proposal.summary}</p>
      </div>
      <ol className="flex min-w-0 flex-col gap-1" aria-label="Orders in drop order">
        {orders.map((o) => (
          <li key={o.id} className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="shrink-0 font-medium">{o.order_ref}</span>
            <span className="min-w-0 truncate text-text-muted">{data.sites[o.site_id]?.name}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          aria-expanded={showWhy}
          onClick={() => setShowWhy((s) => !s)}
          className="w-fit text-xs font-medium text-accent-text hover:underline"
        >
          {showWhy ? "Hide why" : "Why this load?"}
        </button>
        {showWhy ? (
          <ul className="flex flex-col gap-1" aria-label="Why this load">
            {proposal.reasons.map((r) => (
              <li key={r} className="text-xs break-words text-text-muted">
                {r}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" loading={pending} onClick={() => accept(false)}>
          Accept
        </Button>
        <Button size="sm" loading={pending} onClick={() => accept(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Dismiss
        </Button>
      </div>
    </article>
  );
}
