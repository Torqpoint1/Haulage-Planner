"use client";

import {
  CircleAlert,
  CircleCheck,
  Clock,
  CloudOff,
  LoaderCircle,
  Navigation,
  OctagonAlert,
  Phone,
  Route,
  Truck,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { navigateUrl, telUrl } from "@/lib/drivers/navigate";
import type { QueuedPod } from "@/lib/drivers/queue";
import {
  FAILURE_REASONS,
  OUTCOMES,
  type DriverRun,
  type Outcome,
  type RunLoad,
  type RunStop,
} from "@/lib/drivers/types";
import { formatDateLong, formatTime, fromIsoDate, plural } from "@/lib/format";
import { LOAD_STATUSES } from "@/lib/planning/types";
import { OfflineSupport } from "@/components/offline/offline-support";
import { RecordSheet, type RecordedPod } from "./record-sheet";
import { usePodQueue } from "./use-pod-queue";

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const RECORDABLE = ["confirmed", "loading", "out"];

/** What the driver last recorded at a stop: from the outbox if it's still waiting there. */
type StopState = {
  outcome: Outcome | null;
  summary: string | null;
  queued: QueuedPod | null;
};

function stopState(stop: RunStop, queued: QueuedPod | undefined): StopState {
  if (queued) {
    const s = queued.submission;
    return {
      outcome: s.outcome,
      summary: summarise(s.outcome, s.receivedBy, s.failureReason, s.recordedAt),
      queued,
    };
  }
  if (stop.pod) {
    const p = stop.pod;
    return {
      outcome: p.outcome,
      summary: summarise(p.outcome, p.receivedBy, p.failureReason, p.recordedAt),
      queued: null,
    };
  }
  return { outcome: null, summary: null, queued: null };
}

function summarise(outcome: Outcome, receivedBy: string, reason: string | null, at: string) {
  const time = formatTime(at);
  if (outcome !== "failed" && !receivedBy) return `Done at ${time}`;
  if (outcome === "failed") {
    const label = FAILURE_REASONS.find((r) => r.value === reason)?.label ?? "Failed";
    return `Failed at ${time}: ${label}`;
  }
  return `${outcome === "delivered" ? "Delivered" : "Part delivered"} at ${time} · received by ${receivedBy}`;
}

function OutcomeBadge({ state }: { state: StopState }) {
  if (!state.outcome) return null;
  const o = OUTCOMES.find((x) => x.value === state.outcome)!;
  if (state.queued?.state === "rejected") {
    return <Badge tone="danger">Not saved</Badge>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge tone={o.tone as StatusTone}>{o.label}</Badge>
      {state.queued ? (
        <Badge tone="neutral" icon={<Clock aria-hidden />}>
          Waiting to send
        </Badge>
      ) : null}
    </span>
  );
}

function StopCard({
  stop,
  load,
  state,
  isNext,
  onRecord,
}: {
  stop: RunStop;
  load: RunLoad;
  state: StopState;
  isNext: boolean;
  onRecord: (stop: RunStop, outcome: Outcome) => void;
}) {
  const done = Boolean(state.outcome) && state.queued?.state !== "rejected";
  const canRecord = RECORDABLE.includes(load.status);
  const time = stop.bookingSlot
    ? `Booked for ${hhmm(stop.bookingSlot)}${stop.bookingRef ? ` · ref ${stop.bookingRef}` : ""}`
    : stop.etaFrom || stop.etaTo
      ? `Deliver ${[hhmm(stop.etaFrom), hhmm(stop.etaTo)].filter(Boolean).join("–")}`
      : stop.eta
        ? `About ${stop.eta} (est.)`
        : null;
  const details = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <p className="break-words whitespace-pre-line">{stop.site.address}</p>
        <p className="font-medium">{stop.site.postcode}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg" variant={isNext ? "primary" : "secondary"}>
          <a
            href={navigateUrl(
              stop.site,
              typeof navigator === "undefined" ? "" : navigator.userAgent,
            )}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation aria-hidden />
            Navigate
          </a>
        </Button>
        {stop.contacts.map((c) => {
          const tel = telUrl(c.phone);
          return tel ? (
            <Button key={`${c.name}${c.phone}`} asChild size="lg">
              <a href={tel} aria-label={`Call ${c.name || c.phone}`}>
                <Phone aria-hidden />
                <span className="truncate">{c.name || c.phone}</span>
              </a>
            </Button>
          ) : null;
        })}
      </div>
      {stop.instructions.length || stop.siteNotes.length ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase">Delivery instructions</h4>
          <ul aria-label="Delivery instructions" className="flex flex-col gap-1 text-sm">
            {[...stop.instructions, ...stop.siteNotes].map((t) => (
              <li key={t} className="break-words whitespace-pre-line">
                {t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {stop.assets.length ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase">Returnable assets</h4>
          <ul aria-label="Returnable assets" className="flex flex-col gap-1 text-sm">
            {stop.assets.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.direction === "drop" ? "Leave" : "Collect"}:</span>{" "}
                {a.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {stop.handling.length ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-text-muted uppercase">Handling</h4>
          <ul aria-label="Handling" className="flex flex-wrap gap-1">
            {stop.handling.map((h) => (
              <li key={h}>
                <Badge tone="warning">{h}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={cn("flex flex-col gap-2", !stop.orders.length && "hidden")}>
        <h4 className="text-xs font-semibold text-text-muted uppercase">
          {plural(stop.orders.length, "order")}
        </h4>
        <ul className="flex flex-col gap-2">
          {stop.orders.map((o) => (
            <li key={o.id} className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-muted p-3">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{o.order_ref}</span>
                {o.customer_po ? (
                  <span className="num shrink-0 text-xs text-text-muted">PO {o.customer_po}</span>
                ) : null}
              </div>
              <ul className="flex flex-col text-sm">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex min-w-0 gap-2">
                    <span className="num shrink-0 font-medium">{l.quantity} ×</span>
                    <span className="min-w-0 truncate">
                      {l.unitName}
                      {l.description ? ` · ${l.description}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  return (
    <li>
      <Card
        className={cn(
          "flex min-w-0 flex-col gap-4 p-4",
          isNext && "border-accent ring-1 ring-accent",
        )}
        aria-label={`Stop ${stop.sequence}: ${stop.site.name}`}
        role="article"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "num flex size-control-sm shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              done ? "bg-surface-muted text-text-muted" : "bg-accent text-accent-fg",
            )}
            aria-hidden
          >
            {stop.sequence}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="truncate text-base font-semibold">{stop.site.name}</h3>
            <p className="truncate text-sm text-text-muted">{stop.customers.join(", ")}</p>
            {time ? <p className="text-sm font-medium">{time}</p> : null}
            <div className="flex flex-wrap items-center gap-1">
              {isNext && !done ? <Badge tone="info">Next stop</Badge> : null}
              <OutcomeBadge state={state} />
            </div>
          </div>
        </div>

        {state.queued?.state === "rejected" ? (
          <p role="alert" className="flex gap-2 text-sm text-danger-fg">
            <OctagonAlert className="mt-px size-icon-sm shrink-0" aria-hidden />
            {state.queued.error}
          </p>
        ) : null}
        {done && state.summary ? <p className="text-sm">{state.summary}</p> : null}

        {done ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-accent-text">
              Stop details
            </summary>
            <div className="pt-4">{details}</div>
          </details>
        ) : (
          details
        )}

        {canRecord ? (
          done ? (
            <Button size="lg" onClick={() => onRecord(stop, state.outcome ?? "delivered")}>
              Change what was recorded
            </Button>
          ) : !stop.orders.length ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Button size="lg" variant="primary" onClick={() => onRecord(stop, "delivered")}>
                <CircleCheck aria-hidden />
                Collected
              </Button>
              <Button size="lg" onClick={() => onRecord(stop, "failed")}>
                <OctagonAlert aria-hidden />
                Couldn&apos;t collect
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Button size="lg" variant="primary" onClick={() => onRecord(stop, "delivered")}>
                <CircleCheck aria-hidden />
                Delivered
              </Button>
              <Button size="lg" onClick={() => onRecord(stop, "part_delivered")}>
                <CircleAlert aria-hidden />
                Part delivered
              </Button>
              <Button size="lg" onClick={() => onRecord(stop, "failed")}>
                <OctagonAlert aria-hidden />
                Failed
              </Button>
            </div>
          )
        ) : null}
      </Card>
    </li>
  );
}

function LoadRun({
  load,
  states,
  onRecord,
}: {
  load: RunLoad;
  states: Map<string, StopState>;
  onRecord: (stop: RunStop, load: RunLoad, outcome: Outcome) => void;
}) {
  const status = LOAD_STATUSES.find((s) => s.value === load.status);
  const doneCount = load.stops.filter((s) => {
    const st = states.get(s.id);
    return st?.outcome && st.queued?.state !== "rejected";
  }).length;
  const next = load.stops.find((s) => {
    const st = states.get(s.id);
    return !st?.outcome || st.queued?.state === "rejected";
  });
  return (
    <section aria-label={load.title} className="flex min-w-0 flex-col gap-4">
      <Card className="flex min-w-0 flex-col gap-2 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Truck className="size-icon shrink-0 text-text-muted" aria-hidden />
            <div className="flex min-w-0 flex-col">
              <h2 className="truncate text-lg font-semibold">{load.title}</h2>
              <p className="truncate text-sm text-text-muted">{load.subtitle}</p>
            </div>
          </div>
          {status ? <Badge tone={status.tone as StatusTone}>{status.label}</Badge> : null}
        </div>
        <p className="text-sm">
          Leave {load.depot?.name ?? "the depot"} at{" "}
          <span className="num font-medium">{hhmm(load.startTime)}</span>
          {load.crew > 1 ? ` · crew of ${load.crew}` : ""} ·{" "}
          <span className="num">
            {doneCount} of {plural(load.stops.length, "stop")} done
          </span>
        </p>
        {load.notes ? (
          <p className="text-sm break-words whitespace-pre-line">{load.notes}</p>
        ) : null}
        {load.status === "planned" ? (
          <p className="flex gap-2 text-sm text-info-fg">
            <CircleAlert className="mt-px size-icon-sm shrink-0" aria-hidden />
            Waiting for the planner to confirm this load. You can record deliveries once it&apos;s
            confirmed.
          </p>
        ) : null}
      </Card>
      <ol aria-label={`Stops for ${load.title}`} className="flex min-w-0 flex-col gap-4">
        {load.stops.map((s) => (
          <StopCard
            key={s.id}
            stop={s}
            load={load}
            state={states.get(s.id) ?? { outcome: null, summary: null, queued: null }}
            isNext={next?.id === s.id && RECORDABLE.includes(load.status)}
            onRecord={(stop, outcome) => onRecord(stop, load, outcome)}
          />
        ))}
      </ol>
    </section>
  );
}

/** The outbox, in plain English: what's waiting, what's sending, what needs attention. */
function OutboxStatus({ queue }: { queue: ReturnType<typeof usePodQueue> }) {
  const waiting = queue.entries.filter((e) => e.state === "waiting");
  const rejected = queue.entries.filter((e) => e.state === "rejected");
  if (!queue.ready || (!waiting.length && !rejected.length && queue.online)) return null;
  return (
    <div role="status" aria-label="Deliveries waiting to send" className="flex flex-col gap-2">
      {waiting.length || !queue.online ? (
        <Card className="flex min-w-0 items-start gap-3 p-4">
          {queue.sending ? (
            <LoaderCircle
              className="mt-px size-icon shrink-0 animate-spin text-info-fg"
              aria-hidden
            />
          ) : (
            <CloudOff className="mt-px size-icon shrink-0 text-text-muted" aria-hidden />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium">
              {!queue.online ? "No signal. " : ""}
              {waiting.length
                ? `${plural(waiting.length, "delivery", "deliveries")} saved on this phone, waiting to send.`
                : "Anything you record is saved on this phone."}
            </p>
            <p className="text-sm text-text-muted">
              {queue.sending ? "Sending now…" : "They send by themselves when you have signal."}
            </p>
          </div>
          {waiting.length && !queue.sending ? (
            <Button size="sm" onClick={() => void queue.flush()}>
              Send now
            </Button>
          ) : null}
        </Card>
      ) : null}
      {rejected.map((e) => (
        <Card key={e.clientId} className="flex min-w-0 flex-col gap-2 border-danger-border p-4">
          <p className="flex gap-2 text-sm font-medium text-danger-fg">
            <OctagonAlert className="mt-px size-icon-sm shrink-0" aria-hidden />
            {e.siteName}: not saved
          </p>
          <p className="text-sm">{e.error}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void queue.retry(e.clientId)}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void queue.discard(e.clientId)}>
              Discard
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DriverRunView({
  run,
  userId,
  organisationId,
}: {
  run: DriverRun;
  userId: string;
  organisationId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queue = usePodQueue(userId);
  const [recording, setRecording] = useState<{
    stop: RunStop;
    load: RunLoad;
    outcome: Outcome;
  } | null>(null);

  // The latest outbox entry for each stop wins over what the server knows.
  const states = new Map<string, StopState>();
  for (const load of run.loads) {
    for (const stop of load.stops) {
      const queued = [...queue.entries].reverse().find((e) => e.stopId === stop.id);
      states.set(stop.id, stopState(stop, queued));
    }
  }

  async function save(pod: RecordedPod) {
    if (!recording) return;
    const clientId = crypto.randomUUID();
    try {
      // A newer record for the same stop replaces any still waiting.
      for (const old of queue.entries.filter((e) => e.stopId === recording.stop.id)) {
        await queue.discard(old.clientId);
      }
      await queue.enqueue({
        clientId,
        userId,
        organisationId,
        loadId: recording.load.id,
        stopId: recording.stop.id,
        siteName: recording.stop.site.name,
        submission: { ...pod.submission, clientId, stopId: recording.stop.id },
        signature: pod.signature,
        photos: pod.photos,
        state: "waiting",
        error: null,
        attempts: 0,
        queuedAt: new Date().toISOString(),
      });
    } catch {
      toast.error("Couldn't save on this phone. Check it has free space, then try again.");
      return;
    }
    // No toast: on a phone it would sit over the next stop's buttons. The stop's
    // badge and the outbox banner show it's saved and whether it has sent.
    setRecording(null);
  }

  const header = (
    <PageHeader
      title="My run"
      description={`${run.driver ? `${run.driver.name} · ` : ""}${formatDateLong(fromIsoDate(run.date))}`}
      actions={
        run.drivers ? (
          <Select
            aria-label="Driver"
            className="w-menu"
            value={run.driver?.id ?? ""}
            placeholder="Choose a driver"
            onValueChange={(id) => router.push(`${pathname}?driver=${id}`)}
            options={run.drivers.map((d) => ({ value: d.id, label: d.name }))}
          />
        ) : null
      }
    />
  );

  return (
    <PageContainer className="flex flex-col gap-6">
      <OfflineSupport />
      {header}
      <OutboxStatus queue={queue} />
      {!run.driver ? (
        <Card>
          <EmptyState
            icon={UserX}
            title={run.drivers ? "Choose a driver" : "Your login isn't linked to a driver"}
            description={
              run.drivers
                ? "Pick a driver above to see their run."
                : "Ask an admin to link your login to your name in Settings → Drivers."
            }
            action={
              run.drivers ? (
                <Button asChild size="sm">
                  <Link href="/settings/drivers">Go to drivers</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : !run.loads.length ? (
        <Card>
          <EmptyState
            icon={Route}
            title="No run assigned today"
            description="When a planner gives you a load, your stops, contacts, delivery instructions and booking slots appear here."
            action={
              <Button size="sm" onClick={() => router.refresh()}>
                Check again
              </Button>
            }
          />
        </Card>
      ) : (
        run.loads.map((load) => (
          <LoadRun
            key={load.id}
            load={load}
            states={states}
            onRecord={(stop, l, outcome) => setRecording({ stop, load: l, outcome })}
          />
        ))
      )}
      {recording ? (
        <RecordSheet
          key={recording.stop.id}
          stop={recording.stop}
          initialOutcome={recording.outcome}
          open
          onOpenChange={(open) => !open && setRecording(null)}
          onSave={save}
        />
      ) : null}
    </PageContainer>
  );
}
