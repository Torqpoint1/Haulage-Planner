"use client";

import { LogOut, Monitor, Moon, Rows3, Rows4, Sun } from "lucide-react";
import { useTransition } from "react";
import { useTheme, type Density, type ThemePreference } from "@/components/theme/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_INFO, type Role } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { signOut } from "./actions";

type UserMenuProps = {
  name: string;
  email: string;
  role: Role;
  orgName: string;
  /** "full" shows the name beside the avatar (wide sidebar). */
  variant?: "full" | "icon";
  side?: "top" | "bottom" | "right";
  className?: string;
};

/** Account menu with the per-user appearance and density settings (10.3, 10.5). */
export function UserMenu({
  name,
  email,
  role,
  orgName,
  variant = "icon",
  side = "bottom",
  className,
}: UserMenuProps) {
  const { theme, setTheme, density, setDensity } = useTheme();
  const [signingOut, startSignOut] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account and display settings for ${name}`}
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-md text-left hover:bg-surface-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          variant === "full" ? "w-full p-2" : "p-1",
          className,
        )}
      >
        <Avatar name={name} size="md" />
        {variant === "full" ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-text-subtle">{orgName}</span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={side === "right" ? "end" : "end"}
        className="w-popover"
      >
        <div className="flex min-w-0 flex-col px-2 py-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-text-subtle">{email}</span>
          <span className="truncate text-xs text-text-subtle">
            {ROLE_INFO[role].label} · {orgName}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden /> Match system
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
          <DropdownMenuRadioItem value="comfortable">
            <Rows3 aria-hidden /> Comfortable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">
            <Rows4 aria-hidden /> Compact
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOut())}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
