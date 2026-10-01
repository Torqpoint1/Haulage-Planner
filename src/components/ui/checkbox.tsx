"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Larger box and hit area for warehouse tablets (9.5). */
  size?: "md" | "lg";
};

export function Checkbox({
  label,
  description,
  size = "md",
  className,
  id,
  ...props
}: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? `checkbox-${autoId}`;
  const box = (
    <CheckboxPrimitive.Root
      id={boxId}
      className={cn(
        "peer flex shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface",
        "transition-colors hover:border-text-subtle",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg",
        "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-fg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "lg" ? "size-6" : "size-icon-sm",
        !label && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === "indeterminate" ? (
          <Minus
            className={size === "lg" ? "size-icon-sm" : "size-3"}
            strokeWidth={3}
            aria-hidden
          />
        ) : (
          <Check
            className={size === "lg" ? "size-icon-sm" : "size-3"}
            strokeWidth={3}
            aria-hidden
          />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        size === "lg" ? "min-h-control-lg items-center" : "min-h-6",
        className,
      )}
    >
      <span className={cn("flex items-center", size === "lg" ? "h-control-lg" : "h-6")}>{box}</span>
      <label
        htmlFor={boxId}
        className={cn(
          "flex min-w-0 flex-col py-px select-none peer-disabled:opacity-50",
          size === "lg" ? "text-base" : "text-sm",
        )}
      >
        <span className="text-text">{label}</span>
        {description ? <span className="text-sm text-text-subtle">{description}</span> : null}
      </label>
    </div>
  );
}
