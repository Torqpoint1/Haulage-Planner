import {
  Building2,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Route,
  Settings,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { canAccess, type Area, type Role } from "@/lib/auth/roles";

export type NavItem = {
  href: string;
  area: Area;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest go under "More". */
  phonePrimary: boolean;
};

/** The seven tabs, in the order planners work (spec 9). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", area: "today", label: "Today", icon: LayoutDashboard, phonePrimary: true },
  { href: "/plan", area: "plan", label: "Plan", icon: CalendarDays, phonePrimary: true },
  { href: "/orders", area: "orders", label: "Orders", icon: ClipboardList, phonePrimary: true },
  {
    href: "/customers",
    area: "customers",
    label: "Customers",
    icon: Building2,
    phonePrimary: true,
  },
  {
    href: "/warehouse",
    area: "warehouse",
    label: "Warehouse",
    icon: Warehouse,
    phonePrimary: false,
  },
  { href: "/history", area: "history", label: "History", icon: History, phonePrimary: false },
  { href: "/settings", area: "settings", label: "Settings", icon: Settings, phonePrimary: false },
];

/** Drivers get their run sheet instead of the planning tabs (spec 9.8). */
const DRIVER_ITEM: NavItem = {
  href: "/driver",
  area: "driver",
  label: "My run",
  icon: Route,
  phonePrimary: true,
};

/** The tabs a role can open, so nobody sees a link that leads nowhere. */
export function navFor(role: Role): NavItem[] {
  if (role === "driver") return [DRIVER_ITEM];
  return NAV_ITEMS.filter((item) => canAccess(role, item.area));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Working name until branding is decided (spec 17). */
export const APP_NAME = "Haulage Planner";
