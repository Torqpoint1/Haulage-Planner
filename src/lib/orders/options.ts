import type { StatusTone } from "@/components/ui/badge";

/** Order choices (spec 6.7). Values match the database CHECK constraints. */

export const URGENCY = [
  { value: "standard", label: "Standard", tone: "neutral" },
  { value: "timed", label: "Timed", tone: "info" },
  { value: "critical", label: "Critical", tone: "danger" },
] as const satisfies readonly { value: string; label: string; tone: StatusTone }[];

export const READINESS = [
  { value: "not_started", label: "Not started", tone: "neutral" },
  { value: "in_production", label: "In production", tone: "info" },
  { value: "part_ready", label: "Part ready", tone: "warning" },
  { value: "ready", label: "Ready", tone: "success" },
] as const satisfies readonly { value: string; label: string; tone: StatusTone }[];

export const ORDER_STATUS = [
  { value: "unplanned", label: "Unplanned", tone: "neutral" },
  { value: "planned", label: "Planned", tone: "info" },
  { value: "loaded", label: "Loaded", tone: "info" },
  { value: "out_for_delivery", label: "Out for delivery", tone: "info" },
  { value: "delivered", label: "Delivered", tone: "success" },
  { value: "failed", label: "Failed", tone: "danger" },
  { value: "cancelled", label: "Cancelled", tone: "neutral" },
] as const satisfies readonly { value: string; label: string; tone: StatusTone }[];

export type Urgency = (typeof URGENCY)[number]["value"];
export type Readiness = (typeof READINESS)[number]["value"];
export type OrderStatus = (typeof ORDER_STATUS)[number]["value"];

export function optionFor<T extends { value: string }>(list: readonly T[], value: string): T {
  return list.find((o) => o.value === value) ?? list[0];
}
