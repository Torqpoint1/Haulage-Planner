"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** Shared look for every floating surface: menus, popovers, listboxes. */
export const floatingClasses =
  "z-50 rounded-md border border-border bg-surface-raised text-text shadow-overlay outline-none";

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(floatingClasses, "p-3", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
