import { cn } from "@/lib/cn";

/** Loading placeholders: skeletons, not spinners (10.6). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-surface-muted", className)}
      {...props}
    />
  );
}

const lineWidths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"];

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3",
            i === lines - 1 && lines > 1 ? "w-1/2" : lineWidths[i % lineWidths.length],
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-surface p-4",
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <SkeletonText lines={2} />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
      aria-hidden
    >
      <div className="flex gap-4 border-b border-border bg-surface-muted px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-border" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex h-(--row-height) items-center gap-4 border-b border-border px-4 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3 flex-1", c === 0 && "flex-2")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Announces loading to screen readers while skeletons show. */
export function LoadingRegion({
  label = "Loading",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
