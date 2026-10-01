"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { overlayClasses } from "./modal";

type SidePanelProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  /** Short line under the title, e.g. "Thu 01/10 · 18t curtainsider". */
  subtitle?: React.ReactNode;
  /** Badges or actions shown next to the title. */
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky action bar at the bottom (status actions). */
  footer?: React.ReactNode;
  className?: string;
};

/**
 * Slides in from the right over the current screen, so the planner keeps
 * their place (9.2: "a side panel, not a new page"). Full screen on phones.
 */
export function SidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  subtitle,
  headerAside,
  children,
  footer,
  className,
}: SidePanelProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface-raised shadow-overlay outline-none",
            "md:max-w-panel",
            className,
          )}
          {...(subtitle ? {} : { "aria-describedby": undefined })}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 md:px-6">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogPrimitive.Title className="min-w-0 truncate text-lg font-semibold">
                  {title}
                </DialogPrimitive.Title>
                {headerAside}
              </div>
              {subtitle ? (
                <DialogPrimitive.Description className="text-sm text-text-muted">
                  {subtitle}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label="Close panel" className="-mr-2">
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin md:px-6">
            {children}
          </div>
          {footer ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 pb-safe md:px-6">
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A titled block inside a side panel. */
export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-b-0",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
