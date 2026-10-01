"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const DialogClose = DialogPrimitive.Close;

export const overlayClasses = "fixed inset-0 z-40 bg-overlay";

type ModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the modal, if uncontrolled. */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Action buttons, right-aligned at the bottom. */
  footer?: React.ReactNode;
  className?: string;
};

/** Centred dialog for focused tasks: override reasons, confirmations, short forms. */
export function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(overlayClasses, "flex items-center justify-center p-4")}
        >
          <DialogPrimitive.Content
            className={cn(
              "flex max-h-full w-full max-w-modal flex-col",
              "rounded-lg border border-border bg-surface-raised shadow-overlay outline-none",
              className,
            )}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            <div className="flex items-start justify-between gap-4 p-6 pb-0">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="text-sm text-text-muted">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label="Close"
                  className="-mt-1 -mr-2"
                >
                  <X aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
            {children ? (
              <div className="min-h-0 overflow-y-auto p-6 scrollbar-thin">{children}</div>
            ) : (
              <div className="h-6" />
            )}
            {footer ? (
              <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 md:flex-row md:justify-end">
                {footer}
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
