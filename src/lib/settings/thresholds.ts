import { z } from "zod";
import { errorsByField, number, type FormObject } from "./form";

/**
 * Organisation warning thresholds (spec 7.2, the settings marked with a cog).
 * Stored as JSON on the organisation; missing values fall back to these defaults.
 */

export const THRESHOLD_FIELDS = [
  {
    key: "capacity_near_limit_pct",
    label: "Near capacity",
    unit: "%",
    default: 90,
    min: 50,
    max: 100,
    help: "Capacity bars turn amber and the weight check fires at this share of a vehicle's limit.",
  },
  {
    key: "booking_blocking_hours",
    label: "Missing booking blocks a load within",
    unit: "hours",
    default: 24,
    min: 1,
    max: 336,
    help: "Before this, a missing booking reference is a check; after it, it blocks confirmation.",
  },
  {
    key: "not_confirmed_days",
    label: "Delivery not confirmed, warn within",
    unit: "days",
    default: 2,
    min: 0,
    max: 30,
    help: "Warn when a delivery is this close and hasn't been confirmed with the customer.",
  },
  {
    key: "driver_max_driving_hours",
    label: "Driving limit",
    unit: "hours",
    default: 9,
    min: 1,
    max: 15,
    help: "Warn when a run's estimated driving time is longer than this.",
  },
  {
    key: "driver_max_duty_hours",
    label: "Duty limit",
    unit: "hours",
    default: 13,
    min: 1,
    max: 24,
    help: "Warn when a run's estimated total working time is longer than this.",
  },
  {
    key: "fill_gaps_miles",
    label: "Fill the gaps within",
    unit: "miles",
    default: 10,
    min: 1,
    max: 100,
    help: "Suggest ready orders this close to a planned route.",
  },
  {
    key: "asset_collection_miles",
    label: "Suggest asset collections within",
    unit: "miles",
    default: 10,
    min: 1,
    max: 100,
    help: "Suggest collecting overdue returnable assets from sites this close to a route.",
  },
  {
    key: "orders_due_working_days",
    label: "Today screen looks ahead",
    unit: "working days",
    default: 5,
    min: 1,
    max: 20,
    help: "How far ahead the Today screen lists unplanned or unready orders.",
  },
] as const;

export type ThresholdKey = (typeof THRESHOLD_FIELDS)[number]["key"];
export type Thresholds = Record<ThresholdKey, number>;

export const DEFAULT_THRESHOLDS = Object.fromEntries(
  THRESHOLD_FIELDS.map((f) => [f.key, f.default]),
) as Thresholds;

/** Stored JSON → complete thresholds, ignoring anything unknown or out of range. */
export function resolveThresholds(stored: unknown): Thresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  if (stored && typeof stored === "object") {
    for (const f of THRESHOLD_FIELDS) {
      const v = (stored as Record<string, unknown>)[f.key];
      if (typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) out[f.key] = v;
    }
  }
  return out;
}

const schema = z.object(
  Object.fromEntries(
    THRESHOLD_FIELDS.map((f) => [
      f.key,
      number(f.label.toLowerCase(), { integer: true, min: f.min, max: f.max, unit: f.unit }),
    ]),
  ) as unknown as Record<ThresholdKey, z.ZodType<number>>,
);

/** Site information goes stale after this many days (spec 6.1); stored on its own column. */
export const SITE_STALE_FIELD = {
  key: "site_info_stale_days",
  label: "Site details go stale after",
  unit: "days",
  default: 180,
  min: 1,
  max: 3650,
  help: "Sites not checked for this long show a reminder to re-verify their details.",
} as const;

const withStale = schema.extend({
  [SITE_STALE_FIELD.key]: number("the site check period", {
    integer: true,
    min: SITE_STALE_FIELD.min,
    max: SITE_STALE_FIELD.max,
    unit: SITE_STALE_FIELD.unit,
  }),
});

export function parseThresholds(input: FormObject) {
  const result = withStale.safeParse(input);
  if (!result.success) return { ok: false, errors: errorsByField(result.error) } as const;
  const { site_info_stale_days, ...thresholds } = result.data as Thresholds & {
    site_info_stale_days: number;
  };
  return {
    ok: true,
    data: { thresholds: thresholds as Thresholds, site_info_stale_days },
  } as const;
}
