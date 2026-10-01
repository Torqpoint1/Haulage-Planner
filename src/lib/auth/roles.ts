/**
 * Users and roles (spec section 3). The database enforces the same rules with
 * Row Level Security; this module decides what the interface offers and is
 * checked again in every server action.
 */

export const ROLES = ["admin", "planner", "warehouse", "driver", "office"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; who: string; description: string }> = {
  admin: {
    label: "Admin",
    who: "Owner or transport manager",
    description: "Everything, including settings, users and billing.",
  },
  planner: {
    label: "Planner",
    who: "Transport planner",
    description:
      "Create and edit orders, customers, sites and loads; approve plans; override warnings with a reason.",
  },
  warehouse: {
    label: "Warehouse",
    who: "Pickers and loaders",
    description: "View pick sheets, tick items as picked and loaded, and flag shortages.",
  },
  driver: {
    label: "Driver",
    who: "Own-fleet drivers",
    description: "View their own run sheet on a phone, record proof of delivery and report issues.",
  },
  office: {
    label: "Office",
    who: "Sales and admin staff",
    description: "View orders, plans and history, and search. No edits.",
  },
};

/** Screens a role can open. */
export type Area =
  "today" | "plan" | "orders" | "customers" | "warehouse" | "history" | "settings" | "driver";

const AREAS: Record<Role, readonly Area[]> = {
  admin: ["today", "plan", "orders", "customers", "warehouse", "history", "settings", "driver"],
  planner: ["today", "plan", "orders", "customers", "warehouse", "history"],
  office: ["today", "plan", "orders", "customers", "history"],
  warehouse: ["warehouse"],
  driver: ["driver"],
};

/** Actions that change data. */
export type Capability =
  | "settings.manage"
  | "users.manage"
  | "orders.edit"
  | "customers.edit"
  | "loads.edit"
  | "plans.approve"
  | "warnings.override"
  | "warehouse.tick"
  | "pod.record";

const CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: [
    "settings.manage",
    "users.manage",
    "orders.edit",
    "customers.edit",
    "loads.edit",
    "plans.approve",
    "warnings.override",
    "warehouse.tick",
    "pod.record",
  ],
  planner: [
    "orders.edit",
    "customers.edit",
    "loads.edit",
    "plans.approve",
    "warnings.override",
    "warehouse.tick",
  ],
  warehouse: ["warehouse.tick"],
  driver: ["pod.record"],
  office: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canAccess(role: Role, area: Area): boolean {
  return AREAS[role].includes(area);
}

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/** Where a role lands after signing in. */
export function homePath(role: Role): string {
  if (role === "warehouse") return "/warehouse";
  if (role === "driver") return "/driver";
  return "/today";
}
