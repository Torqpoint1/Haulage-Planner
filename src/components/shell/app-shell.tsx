"use client";

import { Ellipsis, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { APP_NAME, NAV_ITEMS, isActive, type NavItem } from "./nav";
import { UserMenu } from "./user-menu";

type AppShellProps = {
  children: React.ReactNode;
  orgName: string;
  userName: string;
};

/**
 * Responsive navigation (spec 9): a left sidebar on desktop (1280+), an icon
 * rail on tablet (768+), and a bottom bar on phones.
 */
export function AppShell({ children, orgName, userName }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* Tablet rail and desktop sidebar */}
      <nav
        aria-label="Main"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface md:flex",
          "w-rail xl:w-sidebar",
        )}
      >
        <div className="flex h-header shrink-0 items-center gap-3 border-b border-border px-4 max-xl:justify-center xl:px-6">
          <BrandMark />
          <span className="hidden min-w-0 flex-col xl:flex">
            <span className="truncate text-sm font-semibold">{APP_NAME}</span>
            <span className="truncate text-xs text-text-subtle">{orgName}</span>
          </span>
        </div>
        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 scrollbar-thin">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(pathname, item.href)} />
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 border-t border-border p-3 max-xl:justify-center">
          <div className="hidden w-full xl:block">
            <UserMenu name={userName} detail={orgName} variant="full" side="top" />
          </div>
          <div className="xl:hidden">
            <UserMenu name={userName} side="right" />
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 flex h-header shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{APP_NAME}</span>
              <span className="truncate text-xs text-text-subtle">{orgName}</span>
            </span>
          </div>
          <UserMenu name={userName} />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col pb-bottombar outline-none md:pb-0"
        >
          {children}
        </main>
      </div>

      <BottomBar pathname={pathname} />
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex size-avatar shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
      <Truck className="size-icon-sm" aria-hidden />
    </span>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-control items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        "max-xl:justify-center max-xl:px-0",
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-text-muted hover:bg-surface-muted hover:text-text",
      )}
    >
      <Icon className="size-icon shrink-0" aria-hidden />
      <span className="truncate max-xl:sr-only">{item.label}</span>
    </Link>
  );
  return (
    <>
      <span className="hidden xl:block">{link}</span>
      <span className="block xl:hidden">
        <Tooltip content={item.label} side="right">
          {link}
        </Tooltip>
      </span>
    </>
  );
}

function BottomBar({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.filter((i) => i.phonePrimary);
  const secondary = NAV_ITEMS.filter((i) => !i.phonePrimary);
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-safe md:hidden"
    >
      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 -z-10 bg-overlay"
            onClick={() => setMoreOpen(false)}
          />
          <ul id="more-menu" className="flex flex-col gap-1 border-b border-border bg-surface p-2">
            {secondary.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-control-lg items-center gap-3 rounded-md px-4 text-base font-medium",
                      active
                        ? "bg-accent-subtle text-accent-text"
                        : "text-text hover:bg-surface-muted",
                    )}
                  >
                    <Icon className="size-icon shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <ul className="grid h-bottombar grid-cols-5">
        {primary.map((item) => (
          <li key={item.href} className="min-w-0">
            <BottomLink
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(pathname, item.href) && !moreOpen}
              onClick={() => setMoreOpen(false)}
            />
          </li>
        ))}
        <li className="min-w-0">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex size-full flex-col items-center justify-center gap-1 text-xs font-medium",
              moreActive || moreOpen ? "text-accent-text" : "text-text-muted",
            )}
          >
            <Ellipsis className="size-icon" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: NavItem["icon"];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
        active ? "text-accent-text" : "text-text-muted hover:text-text",
      )}
    >
      <Icon className="size-icon shrink-0" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
