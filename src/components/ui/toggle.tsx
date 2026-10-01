"use client";

import { Switch as SwitchPrimitive, ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/cn";

type ToggleProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
};

/** On/off switch for yes/no settings ("must stay upright", "stackable"). */
export function Toggle({ label, description, className, id, ...props }: ToggleProps) {
  const autoId = useId();
  const switchId = id ?? `toggle-${autoId}`;
  const control = (
    <SwitchPrimitive.Root
      id={switchId}
      className={cn(
        "peer inline-flex h-6 w-control shrink-0 items-center rounded-full border border-transparent px-px",
        "bg-border-strong transition-colors data-[state=checked]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-icon rounded-full bg-white shadow-raised transition-transform",
          "translate-x-0 data-[state=checked]:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <label htmlFor={switchId} className="flex min-w-0 flex-col select-none">
        <span className="text-sm font-medium text-text">{label}</span>
        {description ? <span className="text-sm text-text-subtle">{description}</span> : null}
      </label>
      {control}
    </div>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Hide the text label (icon only); the label is still used for screen readers. */
  iconOnly?: boolean;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
};

/** Pick one of a few views or modes (Week/Day, Comfortable/Compact). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-muted p-1",
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          aria-label={option.iconOnly ? option.label : undefined}
          title={option.iconOnly ? option.label : undefined}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap text-text-muted transition-colors",
            "hover:text-text focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
            "data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-raised",
            "[&_svg]:size-icon-sm [&_svg]:shrink-0",
            size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm",
            option.iconOnly && (size === "sm" ? "w-6 px-0" : "w-8 px-0"),
          )}
        >
          {option.icon}
          {option.iconOnly ? null : option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
