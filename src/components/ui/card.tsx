import { cn } from "@/lib/cn";

type CardProps = React.ComponentProps<"div"> & {
  /** Raised cards (being dragged, menus) get a shadow; others stay flat (10.2). */
  raised?: boolean;
  /** Make the whole card a hover/press target. */
  interactive?: boolean;
  selected?: boolean;
};

export function Card({ className, raised, interactive, selected, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border bg-surface",
        raised && "shadow-raised",
        interactive && "cursor-pointer transition-colors hover:border-border-strong",
        selected && "border-accent outline-2 -outline-offset-1 outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start justify-between gap-4 p-(--card-padding) pb-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("min-w-0 truncate text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-text-subtle", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-(--card-padding)", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-(--card-padding) py-3",
        className,
      )}
      {...props}
    />
  );
}
