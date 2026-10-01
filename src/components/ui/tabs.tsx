"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex min-w-0 items-end gap-4 overflow-x-auto border-b border-border scrollbar-thin",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex h-control shrink-0 items-center gap-2 border-b-2 border-transparent px-1 text-sm font-medium whitespace-nowrap text-text-muted",
        "transition-colors hover:text-text",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
        "data-[state=active]:border-accent data-[state=active]:text-accent-text",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="num rounded-full bg-surface-muted px-2 text-xs text-text-muted">
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("pt-4 focus-visible:outline-2 focus-visible:outline-focus", className)}
      {...props}
    />
  );
}
