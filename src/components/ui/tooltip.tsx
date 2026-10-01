"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Controlled open state, e.g. for tap-to-show on touch screens. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

export function Tooltip({
  content,
  children,
  side = "top",
  open,
  onOpenChange,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-popover rounded-md bg-text px-2 py-1 text-xs text-surface shadow-overlay",
            "break-words",
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-text" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
