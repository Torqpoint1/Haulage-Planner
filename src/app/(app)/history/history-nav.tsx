"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/history", label: "Deliveries" },
  { href: "/history/assets", label: "Assets" },
  { href: "/history/reports", label: "Reports" },
];

/** History's views: what was delivered, where the returnable assets are, and reports. */
export function HistoryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="History" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = t.href === "/history" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-control items-center border-b-2 px-3 text-sm font-medium",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active
                ? "border-accent text-text"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
