import { cn } from "@/lib/cn";

/** A single headline figure, e.g. "Loads today: 6". */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <dt className="truncate text-sm text-text-muted">{label}</dt>
      <dd className="num text-xl font-semibold">{value}</dd>
    </div>
  );
}

export function StatGroup({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-2 gap-4 md:grid-cols-4", className)} {...props} />;
}
