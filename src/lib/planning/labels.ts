import { formatPercent } from "@/lib/format";
import type { RuleUnitType } from "@/lib/rules/context";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import type { PlanData, PlanLoad, PlanOrder } from "./types";

/** "6 DP · 2 EUR" for an order or a set of orders. */
export function unitsText(orders: PlanOrder[], unitTypes: Record<string, RuleUnitType>): string {
  const totals = new Map<string, number>();
  for (const l of orders.flatMap((o) => o.lines)) {
    const code = unitTypes[l.unit_type_id]?.short_code ?? "?";
    totals.set(code, (totals.get(code) ?? 0) + l.quantity);
  }
  return totals.size ? [...totals].map(([code, n]) => `${n} ${code}`).join(" · ") : "No lines";
}

/** What the load card leads with: the vehicle, the haulier, or that neither is chosen yet. */
export function loadTitle(load: PlanLoad, data: PlanData): { title: string; subtitle: string } {
  const vehicle = data.vehicles.find((v) => v.id === load.vehicle_id);
  if (vehicle)
    return {
      title: vehicle.name,
      subtitle: `${labelFor(VEHICLE_TYPES, vehicle.vehicle_type)} · ${vehicle.registration}`,
    };
  const haulier = data.hauliers.find((h) => h.id === load.haulier_id);
  if (haulier) return { title: haulier.name, subtitle: "Haulier" };
  return { title: "No vehicle yet", subtitle: "Choose a vehicle or haulier" };
}

export function driverNames(load: PlanLoad, data: PlanData): string {
  const names = load.driver_ids
    .map((id) => data.drivers.find((d) => d.id === id)?.name)
    .filter(Boolean);
  return names.join(", ");
}

export const sharePercent = (share: number) => formatPercent(share);

/** Postcode area, e.g. "GL" from "GL5 3QF". */
export const postcodeArea = (postcode: string) =>
  postcode
    .trim()
    .toUpperCase()
    .replace(/[0-9].*$/, "");
