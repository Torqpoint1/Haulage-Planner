import type { RuleContext } from "./context";
import { assetOverdue } from "./checks/asset-overdue";
import { bookingMissing } from "./checks/booking-missing";
import { capacitySpace } from "./checks/capacity-space";
import { capacityWeight } from "./checks/capacity-weight";
import { crewTooSmall } from "./checks/crew-too-small";
import { driverHours } from "./checks/driver-hours";
import { lateDelivery } from "./checks/late-delivery";
import { noUnloadMethod } from "./checks/no-unload-method";
import { notConfirmed } from "./checks/not-confirmed";
import { orderNotReady } from "./checks/order-not-ready";
import { orderPartReady } from "./checks/order-part-ready";
import { outsideWindow } from "./checks/outside-window";
import { siteInfoStale } from "./checks/site-info-stale";
import { siteVehicleAccess } from "./checks/site-vehicle-access";
import { tailLiftWeight } from "./checks/tail-lift-weight";
import { uprightHandball } from "./checks/upright-handball";
import { uprightTailLift } from "./checks/upright-tail-lift";
import { zoneCompliance } from "./checks/zone-compliance";
import { warningKey, type Check } from "./helpers";
import { SEVERITY_ORDER, type Warning } from "./types";

/** Every v1 check (spec 7.2), in the order the spec lists them. */
export const CHECKS: Record<string, Check> = {
  CAPACITY_SPACE: capacitySpace,
  CAPACITY_WEIGHT: capacityWeight,
  UPRIGHT_TAIL_LIFT: uprightTailLift,
  UPRIGHT_HANDBALL: uprightHandball,
  TAIL_LIFT_WEIGHT: tailLiftWeight,
  NO_UNLOAD_METHOD: noUnloadMethod,
  CREW_TOO_SMALL: crewTooSmall,
  SITE_VEHICLE_ACCESS: siteVehicleAccess,
  BOOKING_MISSING: bookingMissing,
  OUTSIDE_WINDOW: outsideWindow,
  ORDER_NOT_READY: orderNotReady,
  ORDER_PART_READY: orderPartReady,
  NOT_CONFIRMED: notConfirmed,
  SITE_INFO_STALE: siteInfoStale,
  ZONE_COMPLIANCE: zoneCompliance,
  DRIVER_HOURS: driverHours,
  LATE_DELIVERY: lateDelivery,
  ASSET_OVERDUE: assetOverdue,
};

/** All warnings for a load, most serious first. */
export function runChecks(ctx: RuleContext): Warning[] {
  return Object.values(CHECKS)
    .flatMap((check) => check(ctx))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export type Decision = { kind: "override" | "dismiss"; reason: string; by: string };
export type DecidedWarning = Warning & { key: string; decision: Decision | null };

/** Attach the planner's overrides and dismissals to the live warnings (spec 7.3). */
export function withDecisions(
  warnings: Warning[],
  decisions: Record<string, Decision>,
): DecidedWarning[] {
  return warnings.map((w) => {
    const key = warningKey(w);
    const d = decisions[key] ?? null;
    // A dismissal only applies to checks and info; an override only to blocking.
    const fits =
      d && (d.kind === "override" ? w.severity === "blocking" : w.severity !== "blocking");
    return { ...w, key, decision: fits ? d : null };
  });
}

/** Blocking warnings nobody has overridden: these stop a load being confirmed. */
export const unresolvedBlocking = (warnings: DecidedWarning[]) =>
  warnings.filter((w) => w.severity === "blocking" && !w.decision);

export { warningKey };
