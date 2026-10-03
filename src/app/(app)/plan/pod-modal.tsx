"use client";

import { MapPin, RotateCcw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Badge, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { PodDetails } from "@/lib/drivers/details";
import { FAILURE_REASONS, OUTCOMES } from "@/lib/drivers/types";
import { formatDateTime, formatTime } from "@/lib/format";
import { podDetailsAction, replanFailedOrder } from "./pod-actions";

/** A stop's outcome as a status label: green delivered, amber part, red failed. */
export function OutcomeBadge({ status }: { status: string }) {
  const o = OUTCOMES.find((x) => x.value === status);
  if (!o) return null;
  return <Badge tone={o.tone as StatusTone}>{o.label}</Badge>;
}

/** Five minutes or more between recording and arriving means the phone was offline. */
const LATE_MS = 5 * 60_000;

function Details({
  pod,
  canEdit,
  onReplanned,
}: {
  pod: PodDetails;
  canEdit: boolean;
  onReplanned: () => void;
}) {
  const [pending, start] = useTransition();
  const late = new Date(pod.receivedAt).getTime() - new Date(pod.recordedAt).getTime() >= LATE_MS;
  const reason = FAILURE_REASONS.find((r) => r.value === pod.failureReason)?.label;
  return (
    <div className="flex min-w-0 flex-col gap-6 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge status={pod.outcome} />
          <span className="num">{formatDateTime(pod.recordedAt)}</span>
        </div>
        {late ? (
          <p className="text-text-muted">
            Sent from the phone at {formatTime(pod.receivedAt)}, after a spell without signal.
          </p>
        ) : null}
      </div>

      {pod.outcome === "failed" ? (
        <dl className="grid grid-cols-1 gap-2">
          <dt className="font-medium">Reason</dt>
          <dd>{reason}</dd>
          <dt className="font-medium">What happened</dt>
          <dd className="break-words whitespace-pre-line">{pod.note}</dd>
        </dl>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-2">
            <dt className="font-medium">Received by</dt>
            <dd className="break-words">{pod.receivedBy}</dd>
            {pod.note ? (
              <>
                <dt className="font-medium">Damage or shortage notes</dt>
                <dd className="break-words whitespace-pre-line">{pod.note}</dd>
              </>
            ) : null}
          </dl>
          <section aria-label="Signature" className="flex flex-col gap-2">
            <h3 className="font-medium">Signature</h3>
            {pod.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
              <img
                src={pod.signatureUrl}
                alt={`Signature of ${pod.receivedBy}`}
                className="h-signature w-full rounded-md border border-border object-contain"
              />
            ) : (
              <p className="text-text-muted">
                {pod.noSignature ? "Nobody was available to sign; left as instructed." : "None."}
              </p>
            )}
          </section>
        </>
      )}

      {pod.photoUrls.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Photos</h3>
          <ul aria-label="Photos" className="flex flex-wrap gap-2">
            {pod.photoUrls.map((url, i) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className="size-thumb rounded-md border border-border object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Quantities delivered" className="flex flex-col gap-2">
        <h3 className="font-medium">Quantities</h3>
        <ul className="flex flex-col gap-2">
          {pod.orders.map((o) => (
            <li key={o.id} className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-muted p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{o.orderRef}</span>
                {canEdit && o.status === "failed" ? (
                  <Button
                    size="sm"
                    loading={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await replanFailedOrder(o.id);
                        if (r.ok) {
                          toast.success(`${o.orderRef} is back in the unplanned orders`);
                          onReplanned();
                        } else toast.error(r.error);
                      })
                    }
                  >
                    <RotateCcw aria-hidden />
                    Put back to plan
                  </Button>
                ) : o.status === "unplanned" || o.status === "planned" ? (
                  <Badge tone="info">Re-planned</Badge>
                ) : null}
              </div>
              <ul className="flex flex-col gap-1">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {l.unitName}
                      {l.description ? ` · ${l.description}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num">
                        {l.delivered} of {l.ordered}
                      </span>
                      {l.delivered < l.ordered ? (
                        <Badge tone="warning">{l.ordered - l.delivered} short</Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {pod.location ? (
        <a
          className="flex items-center gap-2 text-accent-text hover:underline"
          href={`https://www.google.com/maps/search/?api=1&query=${pod.location.latitude},${pod.location.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin className="size-icon-sm shrink-0" aria-hidden />
          Where it was recorded
          {pod.location.accuracy != null ? ` (within ${Math.round(pod.location.accuracy)} m)` : ""}
        </a>
      ) : (
        <p className="flex items-center gap-2 text-text-muted">
          <MapPin className="size-icon-sm shrink-0" aria-hidden />
          No location: the phone didn&apos;t share it.
        </p>
      )}
    </div>
  );
}

/** The proof of delivery for one stop, loaded when opened. */
export function PodModal({
  stopId,
  title,
  canEdit,
  open,
  onOpenChange,
}: {
  stopId: string;
  title: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; pod: PodDetails | null }
    | { kind: "error"; error: string }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    podDetailsAction(stopId)
      .then((r) => {
        if (cancelled) return;
        setState(r.ok ? { kind: "ready", pod: r.pod } : { kind: "error", error: r.error });
      })
      .catch(() => !cancelled && setState({ kind: "error", error: "Couldn't load it just now." }));
    return () => {
      cancelled = true;
    };
  }, [open, stopId, attempt]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Proof of delivery" description={title}>
      {state.kind === "loading" ? (
        <div className="flex flex-col gap-3" aria-label="Loading proof of delivery">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-signature w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : state.kind === "error" ? (
        <ErrorState
          title="Couldn't load the proof of delivery"
          description={state.error}
          onRetry={() => {
            setState({ kind: "loading" });
            setAttempt((a) => a + 1);
          }}
        />
      ) : state.pod ? (
        <Details pod={state.pod} canEdit={canEdit} onReplanned={() => setAttempt((a) => a + 1)} />
      ) : (
        <p className="text-sm text-text-muted">Nothing has been recorded for this stop yet.</p>
      )}
    </Modal>
  );
}
