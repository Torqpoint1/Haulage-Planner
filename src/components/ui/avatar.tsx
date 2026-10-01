"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted align-middle select-none",
        size === "sm" && "size-avatar-sm text-xs",
        size === "md" && "size-avatar text-xs",
        size === "lg" && "size-avatar-lg text-sm",
        className,
      )}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className="font-medium text-text-muted"
        delayMs={src ? 300 : 0}
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
