"use client";

import { toast as sonner, Toaster as SonnerToaster } from "sonner";
import { CircleAlert, CircleCheck, Info, OctagonAlert, X } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";

/** Mount once in the root layout. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-right"
      offset={24}
      mobileOffset={{ bottom: 80, left: 16, right: 16 }}
      gap={8}
      visibleToasts={4}
      icons={{
        success: <CircleCheck className="size-icon text-success" aria-hidden />,
        error: <OctagonAlert className="size-icon text-danger" aria-hidden />,
        warning: <CircleAlert className="size-icon text-warning" aria-hidden />,
        info: <Info className="size-icon text-info" aria-hidden />,
        close: <X className="size-icon-sm" aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: cn(
            "flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-text shadow-overlay",
            "md:w-(--width)",
          ),
          icon: "mt-px flex shrink-0 items-center",
          content: "flex min-w-0 flex-1 flex-col gap-1",
          title: "text-sm font-medium",
          description: "text-sm text-text-muted",
          actionButton:
            "h-control-sm shrink-0 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover",
          cancelButton:
            "h-control-sm shrink-0 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-surface-muted",
          closeButton:
            "absolute top-2 right-2 flex size-6 items-center justify-center rounded-sm text-text-subtle hover:bg-surface-muted hover:text-text",
        },
      }}
    />
  );
}

type ToastOptions = {
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /** Milliseconds; errors stay until dismissed. */
  duration?: number;
};

function opts(o?: ToastOptions) {
  return {
    description: o?.description,
    duration: o?.duration,
    action: o?.action ? { label: o.action.label, onClick: o.action.onClick } : undefined,
  };
}

/** Plain-English notifications. Every error offers a next step where possible. */
export const toast = {
  success: (title: string, o?: ToastOptions) => sonner.success(title, opts(o)),
  info: (title: string, o?: ToastOptions) => sonner.info(title, opts(o)),
  warning: (title: string, o?: ToastOptions) => sonner.warning(title, opts(o)),
  error: (title: string, o?: ToastOptions) =>
    sonner.error(title, { ...opts(o), duration: o?.duration ?? Infinity, closeButton: true }),
  dismiss: sonner.dismiss,
};
