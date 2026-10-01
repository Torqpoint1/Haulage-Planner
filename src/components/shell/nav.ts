import {
  Building2,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  Settings,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest go under "More". */
  phonePrimary: boolean;
};

/** The seven tabs, in the order planners work (spec 9). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: LayoutDashboard, phonePrimary: true },
  { href: "/plan", label: "Plan", icon: CalendarDays, phonePrimary: true },
  { href: "/orders", label: "Orders", icon: ClipboardList, phonePrimary: true },
  { href: "/customers", label: "Customers", icon: Building2, phonePrimary: true },
  { href: "/warehouse", label: "Warehouse", icon: Warehouse, phonePrimary: false },
  { href: "/history", label: "History", icon: History, phonePrimary: false },
  { href: "/settings", label: "Settings", icon: Settings, phonePrimary: false },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Working name until branding is decided (spec 17). */
export const APP_NAME = "Haulage Planner";
