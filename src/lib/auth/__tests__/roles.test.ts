import { describe, expect, it } from "vitest";
import { ROLES, can, canAccess, homePath, isRole } from "@/lib/auth/roles";

describe("roles (spec section 3)", () => {
  it("only admins manage settings and users", () => {
    for (const role of ROLES) {
      expect(can(role, "settings.manage"), role).toBe(role === "admin");
      expect(can(role, "users.manage"), role).toBe(role === "admin");
      expect(canAccess(role, "settings"), role).toBe(role === "admin");
    }
  });

  it("planners edit orders, customers and loads, approve plans and override warnings", () => {
    for (const cap of [
      "orders.edit",
      "customers.edit",
      "loads.edit",
      "plans.approve",
      "warnings.override",
    ] as const) {
      expect(can("planner", cap)).toBe(true);
      expect(can("office", cap)).toBe(false);
      expect(can("warehouse", cap)).toBe(false);
      expect(can("driver", cap)).toBe(false);
    }
  });

  it("office staff can view orders, plans and history but change nothing", () => {
    expect(["orders", "plan", "history"].every((a) => canAccess("office", a as never))).toBe(true);
    expect(can("office", "orders.edit")).toBe(false);
  });

  it("warehouse staff tick off pick sheets; drivers record proof of delivery", () => {
    expect(can("warehouse", "warehouse.tick")).toBe(true);
    expect(canAccess("warehouse", "orders")).toBe(false);
    expect(can("driver", "pod.record")).toBe(true);
    expect(canAccess("driver", "plan")).toBe(false);
  });

  it("every role lands on a screen it can open", () => {
    for (const role of ROLES) {
      const area = homePath(role).slice(1);
      expect(canAccess(role, area as never), role).toBe(true);
    }
  });

  it("recognises roles", () => {
    expect(isRole("planner")).toBe(true);
    expect(isRole("superuser")).toBe(false);
  });
});
