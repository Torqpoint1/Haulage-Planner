"use client";

import { CircleAlert, Info, OctagonAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { SEVERITY_LABEL, type Severity, type Warning, type WarningFix } from "@/lib/rules/types";
import { Button } from "./button";
import { Field } from "./field";
import { Textarea } from "./input";
import { Modal } from "./modal";

const severityStyle: Record<Severity, { icon: typeof OctagonAlert; box: string; text: string }> = {
  blocking: {
    icon: OctagonAlert,
    box: "border-danger-border bg-danger-bg",
    text: "text-danger-fg",
  },
  check: { icon: CircleAlert, box: "border-warning-border bg-warning-bg", text: "text-warning-fg" },
  info: { icon: Info, box: "border-info-border bg-info-bg", text: "text-info-fg" },
};

export function SeverityLabel({ severity, className }: { severity: Severity; className?: string }) {
  const { icon: Icon, text } = severityStyle[severity];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-semibold",
        text,
        className,
      )}
    >
      <Icon className="size-icon-sm" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

type WarningItemProps = {
  warning: Pick<Warning, "severity" | "title" | "detail" | "fixes"> & { code?: string };
  onFix?: (fix: WarningFix) => void;
  /** Blocking warnings only: called with the planner's written reason. */
  onOverride?: (reason: string) => void;
  /** Check and info warnings only: dismiss for this load. */
  onDismiss?: () => void;
  /** Set once overridden; the warning stays visible with this note (7.3). */
  overridden?: { by: string; reason: string };
  className?: string;
};

/**
 * One rules-engine warning: what is wrong, in plain English, plus the fixes
 * that resolve it (spec 2.5, 7.1). Blocking warnings can be overridden with a
 * reason; checks and info can be dismissed.
 */
export function WarningItem({
  warning,
  onFix,
  onOverride,
  onDismiss,
  overridden,
  className,
}: WarningItemProps) {
  const { severity, title, detail, fixes } = warning;
  const style = severityStyle[severity];
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  function submitOverride() {
    if (reason.trim().length < 5) {
      setReasonError("Write a short reason so others know why this was allowed.");
      return;
    }
    onOverride?.(reason.trim());
    setOverrideOpen(false);
    setReason("");
    setReasonError(null);
  }

  // Fixes only show for someone who can apply them (no handler means read-only).
  const shownFixes = onFix ? fixes : [];
  const showActions = !overridden && (shownFixes.length > 0 || onOverride || onDismiss);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-md border p-3",
        overridden ? "border-border bg-surface-muted" : style.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <SeverityLabel severity={severity} />
          <p className="min-w-0 text-sm font-medium text-text">{title}</p>
        </div>
        <p className="text-sm text-text-muted">{detail}</p>
        {overridden ? (
          <p className="flex items-start gap-1 text-sm text-text-muted">
            <ShieldCheck className="mt-px size-icon-sm shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-text">Overridden by {overridden.by}:</span>{" "}
              {overridden.reason}
            </span>
          </p>
        ) : null}
      </div>
      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {shownFixes.map((fix) => (
            <Button key={fix.id} size="sm" variant="secondary" onClick={() => onFix?.(fix)}>
              {fix.label}
            </Button>
          ))}
          {severity === "blocking" && onOverride ? (
            <Button size="sm" variant="ghost" onClick={() => setOverrideOpen(true)}>
              Override…
            </Button>
          ) : null}
          {severity !== "blocking" && onDismiss ? (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}

      {onOverride ? (
        <Modal
          open={overrideOpen}
          onOpenChange={(open) => {
            setOverrideOpen(open);
            if (!open) setReasonError(null);
          }}
          title="Override blocking warning"
          description={title}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOverrideOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={submitOverride}>
                Override and log
              </Button>
            </>
          }
        >
          <Field
            label="Reason"
            required
            hint="Recorded with your name and the time. The warning stays visible on the load."
            error={reasonError}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer confirmed two people will unload by hand"
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/** Compact counts for load cards: "2 blocking · 1 check". */
export function WarningsBadge({
  counts,
  className,
}: {
  counts: Partial<Record<Severity, number>>;
  className?: string;
}) {
  const entries = (["blocking", "check", "info"] as const).filter((s) => (counts[s] ?? 0) > 0);
  if (entries.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-success-fg",
          className,
        )}
      >
        <ShieldCheck className="size-icon-sm" aria-hidden />
        No warnings
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {entries.map((s) => {
        const { icon: Icon, text } = severityStyle[s];
        return (
          <span
            key={s}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap",
              text,
            )}
          >
            <Icon className="size-icon-sm" aria-hidden />
            <span className="num">{counts[s]}</span>{" "}
            {s === "check" && counts[s] !== 1 ? "checks" : SEVERITY_LABEL[s].toLowerCase()}
          </span>
        );
      })}
    </span>
  );
}
