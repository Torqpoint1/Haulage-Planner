"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./tooltip";

type TruncateProps = {
  children: string;
  className?: string;
  as?: "span" | "p" | "h2" | "h3";
};

/**
 * Long names truncate with an ellipsis and show the full text on hover,
 * keyboard focus or tap (10.7). The tooltip only appears when the text is
 * actually cut off.
 */
export function Truncate({ children, className, as: Tag = "span" }: TruncateProps) {
  const [open, setOpen] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  const isTruncated = () => (el ? el.scrollWidth > el.clientWidth : false);

  return (
    <Tooltip content={children} open={open} onOpenChange={(next) => setOpen(next && isTruncated())}>
      <Tag
        ref={ref}
        className={cn("block min-w-0 truncate", className)}
        // Focusable only when cut off, so keyboard users can reveal the full text.
        tabIndex={el && isTruncated() ? 0 : undefined}
        onClick={() => isTruncated() && setOpen((o) => !o)}
      >
        {children}
      </Tag>
    </Tooltip>
  );
}
