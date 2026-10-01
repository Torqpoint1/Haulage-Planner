"use client";

import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

/** Shared look for every text-like control so they line up (10.2). */
export const controlClasses = cn(
  "w-full min-w-0 rounded-md border border-border-strong bg-surface text-sm text-text",
  "placeholder:text-text-subtle",
  "transition-colors hover:border-text-subtle",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus focus-visible:border-focus",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-subtle disabled:hover:border-border-strong",
  "aria-invalid:border-danger aria-invalid:hover:border-danger",
);

type InputProps = React.ComponentProps<"input"> & {
  /** Icon shown inside the left edge, e.g. a search glass. */
  leadingIcon?: React.ReactNode;
  /** Text or element shown inside the right edge, e.g. "kg". */
  trailing?: React.ReactNode;
  invalid?: boolean;
};

export function Input({ className, leadingIcon, trailing, invalid, ...props }: InputProps) {
  const control = useFieldControl(props);
  const input = (
    <input
      className={cn(
        controlClasses,
        "h-control px-3",
        leadingIcon ? "pl-control" : null,
        trailing ? "pr-control" : null,
        className,
      )}
      {...props}
      {...control}
      aria-invalid={invalid || control["aria-invalid"]}
    />
  );
  if (!leadingIcon && !trailing) return input;
  return (
    <div className="relative min-w-0">
      {leadingIcon ? (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-control items-center justify-center text-text-subtle [&_svg]:size-icon-sm">
          {leadingIcon}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-control items-center justify-center text-sm text-text-subtle">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const control = useFieldControl(props);
  return (
    <textarea
      className={cn(controlClasses, "px-3 py-2 leading-body", className)}
      rows={3}
      {...props}
      {...control}
    />
  );
}
