import { CircleAlert, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description?: React.ReactNode;
  /** The helpful next action (10.6), e.g. "Add your first vehicle". */
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Use inside cards and panels rather than as a full page. */
  compact?: boolean;
  className?: string;
};

/** Every list and panel has a designed empty state with a next action (10.6). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-surface-muted text-text-subtle",
            compact ? "size-control [&_svg]:size-icon" : "size-12 [&_svg]:size-6",
          )}
        >
          <Icon aria-hidden />
        </span>
      ) : null}
      <div className="flex max-w-modal flex-col gap-1">
        <h2 className={cn("font-semibold text-text", compact ? "text-sm" : "text-base")}>
          {title}
        </h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

type ErrorStateProps = {
  title?: string;
  /** Plain English: what went wrong and what the person can do. */
  description?: React.ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
};

/** Errors are explained in plain English with a retry (10.6). */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Check your connection and try again.",
  onRetry,
  compact,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={className}>
      <EmptyState
        compact={compact}
        icon={CircleAlert}
        title={title}
        description={description}
        action={
          onRetry ? (
            <Button onClick={onRetry}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
