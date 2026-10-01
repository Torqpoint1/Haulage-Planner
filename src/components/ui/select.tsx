"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { controlClasses } from "./input";
import { floatingClasses } from "./popover";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

export function Select({
  options,
  placeholder = "Select…",
  className,
  invalid,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  ...rootProps
}: SelectProps) {
  const control = useFieldControl({ id, "aria-describedby": ariaDescribedBy });
  return (
    <SelectPrimitive.Root {...rootProps}>
      <SelectPrimitive.Trigger
        {...control}
        aria-label={ariaLabel}
        aria-invalid={invalid || control["aria-invalid"]}
        className={cn(
          controlClasses,
          "flex h-control items-center justify-between gap-2 px-3 text-left",
          "data-[placeholder]:text-text-subtle",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            floatingClasses,
            "max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  "relative flex h-control-sm cursor-default items-center rounded-sm pr-3 pl-8 text-sm outline-none select-none",
                  "data-[highlighted]:bg-surface-muted data-[disabled]:text-text-subtle data-[disabled]:opacity-60",
                )}
              >
                <span className="absolute left-2 flex items-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-icon-sm text-accent-text" aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
