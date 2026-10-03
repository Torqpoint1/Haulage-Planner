import { formatIsoDate } from "@/lib/format";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import type { RuleContext, RuleOrder, RuleStop, RuleVehicle } from "./context";
import type { Severity, Warning, WarningFix } from "./types";

export type Check = (ctx: RuleContext) => Warning[];

/** The identity an override or dismissal sticks to. */
export const warningKey = (w: Pick<Warning, "code" | "entity">) =>
  `${w.code}:${w.entity.type}:${w.entity.id}`;

export function warning(
  code: string,
  severity: Severity,
  entity: Warning["entity"],
  title: string,
  detail: string,
  fixes: WarningFix[] = [],
): Warning {
  return { code, severity, entity, title, detail, fixes };
}

export const vehicleLabel = (v: RuleVehicle) =>
  `${v.name} (${labelFor(VEHICLE_TYPES, v.vehicle_type)})`;

export const listOf = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const date = formatIsoDate;

/** Vehicles free on the load's date, smallest first. */
export function availableVehicles(ctx: RuleContext): RuleVehicle[] {
  const day = ctx.load.load_date;
  return ctx.vehicles
    .filter(
      (v) =>
        v.id !== ctx.load.vehicle?.id &&
        v.active &&
        !ctx.busyVehicleIds.includes(v.id) &&
        !(
          v.off_road_from &&
          v.off_road_from <= day &&
          (!v.off_road_until || v.off_road_until >= day)
        ),
    )
    .sort((a, b) => a.gross_weight_kg - b.gross_weight_kg || a.name.localeCompare(b.name));
}

/**
 * "Switch to …" fixes: up to two free vehicles with which this same check
 * would no longer fire. The check is simply re-run on the swapped context.
 */
export function switchVehicleFixes(ctx: RuleContext, check: Check, code: string): WarningFix[] {
  // A re-run only asks "does this vehicle pass?"; working out its fixes would recurse forever.
  if (!ctx.load.vehicle || ctx.skipFixes) return [];
  return availableVehicles(ctx)
    .filter(
      (v) =>
        !check({ ...ctx, skipFixes: true, load: { ...ctx.load, vehicle: v } }).some(
          (w) => w.code === code,
        ),
    )
    .slice(0, 2)
    .map((v) => ({
      id: "switch-vehicle",
      label: `Switch to ${v.name}`,
      params: { vehicleId: v.id },
    }));
}

export const removeOrderFix = (o: RuleOrder): WarningFix => ({
  id: "remove-order",
  label: `Take ${o.order_ref} off this load`,
  params: { orderId: o.id },
});

export const editStopFix = (
  stop: RuleStop,
  field: "booking" | "eta" | "confirmation",
  label: string,
): WarningFix => ({
  id: "edit-stop",
  label,
  params: { stopId: stop.id, field },
});

export const unitsOf = (o: RuleOrder, ctx: RuleContext) =>
  o.lines.map((l) => ({ ...l, unit: ctx.unitTypes[l.unit_type_id] }));
