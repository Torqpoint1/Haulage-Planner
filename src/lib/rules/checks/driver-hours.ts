import type { RuleContext } from "../context";
import { estimateRun } from "../estimate";
import { removeOrderFix, warning, type Check } from "../helpers";

const hours = (h: number) => `${h.toFixed(1)} hours`;

/** DRIVER_HOURS (check): the estimated run is longer than the driving or duty limit. */
export const driverHours: Check = (ctx: RuleContext) => {
  if (!ctx.load.vehicle || !ctx.stops.length) return [];
  const run = estimateRun(ctx);
  if (run.drivingHours == null || run.dutyHours == null) return [];
  const { driver_max_driving_hours: drive, driver_max_duty_hours: duty } = ctx.thresholds;
  const over: string[] = [];
  if (run.drivingHours > drive)
    over.push(`about ${hours(run.drivingHours)} driving (limit ${drive})`);
  if (run.dutyHours > duty) over.push(`about ${hours(run.dutyHours)} on duty (limit ${duty})`);
  if (!over.length) return [];
  const last = ctx.stops[ctx.stops.length - 1];
  return [
    warning(
      "DRIVER_HOURS",
      "check",
      { type: "load", id: ctx.load.id },
      "Run may be too long for one driver",
      `Estimate: ${over.join(" and ")}, from straight-line distances with an allowance for roads and unloading.`,
      last.orders.map(removeOrderFix),
    ),
  ];
};
