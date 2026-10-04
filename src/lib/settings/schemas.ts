import { z } from "zod";
import { isHexColour } from "@/lib/color";
import { normalisePostcode, parseAreas, parseAreasOrDistricts } from "@/lib/postcode";
import {
  checkbox,
  checkboxGroup,
  choice,
  errorsByField,
  first,
  number,
  optionalDate,
  optionalNumber,
  optionalText,
  requiredDate,
  text,
  type FormObject,
} from "./form";
import {
  COLOUR_TAGS,
  DAYS,
  HAULIER_SERVICES,
  HAULIER_TYPES,
  LICENCE_CATEGORIES,
  LOAD_TYPES,
  LOADING_EQUIPMENT,
  MIN_UNLOAD_METHODS,
  PALLET_SIZES,
  UNLOAD_METHODS,
  VEHICLE_TYPES,
  COMPLIANCE_REQUIREMENTS,
} from "./options";

/**
 * Validation for every settings form. Shared by the browser (instant
 * feedback) and server actions (the real check). Form field names match
 * database columns, so a valid result can be saved as it is.
 */

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

export const values = <T extends string>(list: readonly { value: T }[]) => list.map((o) => o.value);

export function parse<S extends z.ZodType>(schema: S, input: FormObject): Parsed<z.output<S>> {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: errorsByField(result.error) };
}

export const postcode = z.preprocess(
  (v) => (typeof v === "string" ? (normalisePostcode(v) ?? v) : v),
  z
    .string("Enter a postcode.")
    .min(1, "Enter a postcode.")
    .refine((v) => normalisePostcode(v) !== null, "Enter a full UK postcode, e.g. GL5 3AA."),
);

const areaList = (label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().transform((value, ctx) => {
      const { areas, invalid } = parseAreas(value);
      if (invalid.length) {
        ctx.addIssue({
          code: "custom",
          message: `${invalid.join(", ")} ${invalid.length === 1 ? "isn't a" : "aren't"} postcode area${invalid.length === 1 ? "" : "s"}. Use letters only, e.g. GL, NP, B.`,
        });
        return z.NEVER;
      }
      if (!areas.length && label) {
        ctx.addIssue({ code: "custom", message: `Enter at least one postcode area for ${label}.` });
        return z.NEVER;
      }
      return areas;
    }),
  );

export const phone = optionalText(20).refine(
  (v) => /^[0-9 +()-]*$/.test(v),
  "Use digits, spaces and + ( ) - only.",
);

// ---------------------------------------------------------------------------
// Depots
// ---------------------------------------------------------------------------

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type OpeningHours = Partial<
  Record<(typeof DAYS)[number]["value"], { open: string; close: string } | null>
>;

const depotBase = z.object({
  name: text("a name"),
  address: optionalText(500),
  postcode,
  loading_equipment: checkboxGroup(values(LOADING_EQUIPMENT)),
  is_default: checkbox,
  notes: optionalText(2000),
});

/**
 * Weekly hours from inputs named `<prefix>_<day>_open` / `<prefix>_<day>_close`.
 * Both blank means closed that day. Errors are keyed `<prefix>_<day>`.
 */
export function parseWeeklyHours(
  input: FormObject,
  prefix: string,
  { closedWord = "closed", closeWord = "closing" } = {},
): { hours: OpeningHours; errors: Record<string, string> } {
  const hours: OpeningHours = {};
  const errors: Record<string, string> = {};
  for (const { value: day, label } of DAYS) {
    const open = String(input[`${prefix}_${day}_open`] ?? "").trim();
    const close = String(input[`${prefix}_${day}_close`] ?? "").trim();
    if (!open && !close) {
      hours[day] = null;
      continue;
    }
    if (!TIME.test(open) || !TIME.test(close)) {
      errors[`${prefix}_${day}`] =
        `Enter both times for ${label} as hh:mm, or leave both blank if ${closedWord}.`;
    } else if (close <= open) {
      errors[`${prefix}_${day}`] = `${label}: ${closeWord} time must be after the start.`;
    } else {
      hours[day] = { open, close };
    }
  }
  return { hours, errors };
}

export function parseDepot(
  input: FormObject,
): Parsed<z.output<typeof depotBase> & { opening_hours: OpeningHours }> {
  const base = parse(depotBase, input);
  const { hours, errors: hourErrors } = parseWeeklyHours(input, "hours");
  const errors: Record<string, string> = { ...(base.ok ? {} : base.errors), ...hourErrors };
  if (!base.ok || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { ...base.data, opening_hours: hours } };
}

// ---------------------------------------------------------------------------
// Handling unit types (6.2)
// ---------------------------------------------------------------------------

const unitTypeSchema = z
  .object({
    name: text("a name", 80),
    short_code: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
      z
        .string("Enter a short code.")
        .regex(/^[A-Z0-9-]{1,8}$/, "Use up to 8 letters, numbers or dashes, e.g. EUR or DP."),
    ),
    colour_tag: choice(values(COLOUR_TAGS), "a colour"),
    length_mm: number("length", { integer: true, min: 1, max: 30000, unit: "mm" }),
    width_mm: number("width", { integer: true, min: 1, max: 5000, unit: "mm" }),
    height_mm: number("height", { integer: true, min: 1, max: 5000, unit: "mm" }),
    typical_weight_kg: number("typical weight", { min: 0, max: 50000, unit: "kg" }),
    stackable: checkbox,
    max_stack_height: optionalNumber("maximum stack height", { integer: true, min: 1, max: 20 }),
    must_stay_upright: checkbox,
    fragile: checkbox,
    returnable: checkbox,
    return_days: optionalNumber("days to return", { integer: true, min: 1, max: 365 }),
    requires_two_people: checkbox,
    min_unload_method: choice(values(MIN_UNLOAD_METHODS), "an unloading method"),
    securing_notes: optionalText(1000),
  })
  .transform((v) => ({
    ...v,
    max_stack_height: v.stackable ? v.max_stack_height : null,
    return_days: v.returnable ? v.return_days : null,
  }));

export const parseUnitType = (input: FormObject) => parse(unitTypeSchema, input);

// ---------------------------------------------------------------------------
// Vehicles (6.3)
// ---------------------------------------------------------------------------

const vehicleSchema = z
  .object({
    name: text("a name", 80),
    registration: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ") : v),
      z
        .string("Enter the registration.")
        .regex(/^[A-Z0-9 ]{2,10}$/, "Enter a registration like AB12 CDE."),
    ),
    vehicle_type: choice(values(VEHICLE_TYPES), "a vehicle type"),
    ownership: choice(["owned", "hired"] as const, "owned or hired"),
    deck_length_mm: number("deck length", { integer: true, min: 1, max: 20000, unit: "mm" }),
    deck_width_mm: number("deck width", { integer: true, min: 1, max: 3000, unit: "mm" }),
    deck_height_mm: number("deck height", { integer: true, min: 1, max: 5000, unit: "mm" }),
    payload_kg: number("payload", { integer: true, min: 1, max: 50000, unit: "kg" }),
    gross_weight_kg: number("gross weight", { integer: true, min: 1, max: 60000, unit: "kg" }),
    overall_length_m: number("overall length", { min: 1, max: 25, unit: "m" }),
    unload_methods: checkboxGroup(values(UNLOAD_METHODS)),
    tail_lift_max_kg: optionalNumber("tail lift limit", {
      integer: true,
      min: 1,
      max: 5000,
      unit: "kg",
    }),
    crane_max_kg: optionalNumber("crane limit", { integer: true, min: 1, max: 50000, unit: "kg" }),
    crew_size_default: z.preprocess(
      (v) => Number(v),
      z.union([z.literal(1), z.literal(2)], "Choose 1 or 2."),
    ),
    euro_standard: optionalText(20),
    london_hgv_permit: checkbox,
    london_hgv_permit_expires: optionalDate,
    caz_compliant: checkbox,
    cost_per_mile: number("cost per mile", { min: 0, max: 100 }),
    cost_per_driver_hour: number("cost per driver hour", { min: 0, max: 500 }),
    active: checkbox,
    off_road_from: optionalDate,
    off_road_until: optionalDate,
  })
  .superRefine((v, ctx) => {
    if (v.gross_weight_kg < v.payload_kg) {
      ctx.addIssue({
        code: "custom",
        path: ["gross_weight_kg"],
        message: "Gross weight can't be less than the payload.",
      });
    }
    if (v.unload_methods.includes("tail_lift") && v.tail_lift_max_kg === null) {
      ctx.addIssue({
        code: "custom",
        path: ["tail_lift_max_kg"],
        message: "Enter the tail lift's maximum lift.",
      });
    }
    if (v.unload_methods.includes("crane") && v.crane_max_kg === null) {
      ctx.addIssue({
        code: "custom",
        path: ["crane_max_kg"],
        message: "Enter the crane's maximum lift.",
      });
    }
    if (v.off_road_from && v.off_road_until && v.off_road_until < v.off_road_from) {
      ctx.addIssue({
        code: "custom",
        path: ["off_road_until"],
        message: "The end date must be on or after the start date.",
      });
    }
  })
  .transform((v) => ({
    ...v,
    tail_lift_max_kg: v.unload_methods.includes("tail_lift") ? v.tail_lift_max_kg : null,
    crane_max_kg: v.unload_methods.includes("crane") ? v.crane_max_kg : null,
    london_hgv_permit_expires: v.london_hgv_permit ? v.london_hgv_permit_expires : null,
  }));

export const parseVehicle = (input: FormObject) => parse(vehicleSchema, input);

/** Capacity inputs are named capacity_<unit type id>. Blank or 0 means "doesn't carry this". */
export function parseCapacities(
  input: FormObject,
): Parsed<{ unit_type_id: string; max_units: number }[]> {
  const out: { unit_type_id: string; max_units: number }[] = [];
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!key.startsWith("capacity_")) continue;
    const value = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (!value) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      errors[key] = "Enter a whole number from 0 to 1,000.";
    } else if (n > 0) {
      out.push({ unit_type_id: key.slice("capacity_".length), max_units: n });
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: out };
}

// ---------------------------------------------------------------------------
// Drivers (6.4)
// ---------------------------------------------------------------------------

const driverSchema = z.object({
  name: text("the driver's name"),
  phone,
  licence_categories: checkboxGroup(values(LICENCE_CATEGORIES)),
  user_id: z.preprocess(
    (v) => (v === "" || v === "none" || v === undefined ? null : v),
    z.uuid().nullable(),
  ),
  available_days: checkboxGroup(values(DAYS)),
  active: checkbox,
  notes: optionalText(2000),
});

export const parseDriver = (input: FormObject) => parse(driverSchema, input);

// ---------------------------------------------------------------------------
// Postcode zones (6.13)
// ---------------------------------------------------------------------------

const zoneSchema = z.object({
  name: text("a name", 80),
  colour_tag: choice(values(COLOUR_TAGS), "a colour"),
  postcode_areas: areaList("this zone"),
});

export const parseZone = (input: FormObject) => parse(zoneSchema, input);

// ---------------------------------------------------------------------------
// Hauliers and rate cards (6.5)
// ---------------------------------------------------------------------------

const haulierSchema = z.object({
  name: text("a name"),
  haulier_type: choice(values(HAULIER_TYPES), "a type"),
  contact_name: optionalText(120),
  phone,
  email: optionalText(254).refine(
    (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Enter a valid email address.",
  ),
  vehicle_types: checkboxGroup(values(VEHICLE_TYPES)),
  coverage_areas: areaList(""),
  services: checkboxGroup(values(HAULIER_SERVICES)),
  rating: z.preprocess(
    (v) => (v === "" || v === "none" || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(5).nullable(),
  ),
  active: checkbox,
  notes: optionalText(2000),
});

export const parseHaulier = (input: FormObject) => parse(haulierSchema, input);

const money = (label: string) => number(label, { min: 0, max: 100000 });

const rateCardSchema = z
  .object({
    name: text("a name", 80),
    valid_from: requiredDate("the start date"),
    valid_to: optionalDate,
    per_drop: money("per-drop charge"),
    extra_drop: money("extra-drop charge"),
    surcharge_tail_lift_per_pallet: money("tail lift surcharge"),
    surcharge_timed: money("timed delivery surcharge"),
    surcharge_remote_area: money("remote area surcharge"),
    remote_postcodes: z.preprocess(
      (v) => (typeof v === "string" ? v : ""),
      z.string().transform((value, ctx) => {
        const { values: list, invalid } = parseAreasOrDistricts(value);
        if (invalid.length) {
          ctx.addIssue({
            code: "custom",
            message: `Not postcode areas or districts: ${invalid.join(", ")}.`,
          });
          return z.NEVER;
        }
        return list;
      }),
    ),
    surcharge_two_person: money("two-person surcharge"),
    waiting_per_hour: money("waiting time charge"),
    waiting_free_minutes: number("free waiting time", {
      integer: true,
      min: 0,
      max: 600,
      unit: "minutes",
    }),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.valid_to && v.valid_to < v.valid_from) {
      ctx.addIssue({
        code: "custom",
        path: ["valid_to"],
        message: "The end date must be on or after the start date.",
      });
    }
  });

export const parseRateCard = (input: FormObject) => parse(rateCardSchema, input);

export type PalletPrice = { zone_id: string; pallet_size: string; price: number };
export type LoadPrice = { zone_id: string; load_type: string; price: number };

/** Price grid inputs: pallet_<zone>_<size> and load_<zone>_<type>. Blank means "no price". */
export function parseRatePrices(
  input: FormObject,
): Parsed<{ pallet: PalletPrice[]; load: LoadPrice[] }> {
  const pallet: PalletPrice[] = [];
  const load: LoadPrice[] = [];
  const errors: Record<string, string> = {};
  const sizes = values(PALLET_SIZES) as string[];
  const types = values(LOAD_TYPES) as string[];
  for (const [key, raw] of Object.entries(input)) {
    const match = /^(pallet|load)_([0-9a-f-]{36})_([a-z]+)$/.exec(key);
    if (!match) continue;
    const value = String(Array.isArray(raw) ? raw[0] : raw).replace(/[£,\s]/g, "");
    if (!value) continue;
    const price = Number(value);
    if (Number.isNaN(price) || price < 0 || price > 100000) {
      errors[key] = "Enter a price in pounds, e.g. 42.50.";
      continue;
    }
    const [, kind, zone_id, option] = match;
    if (kind === "pallet" && sizes.includes(option))
      pallet.push({ zone_id, pallet_size: option, price });
    if (kind === "load" && types.includes(option)) load.push({ zone_id, load_type: option, price });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { pallet, load } };
}

// ---------------------------------------------------------------------------
// Organisation and branding (6.1)
// ---------------------------------------------------------------------------

const organisationSchema = z.object({
  name: text("your company's name"),
  accent_colour: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z
      .string()
      .refine(
        (v) => isHexColour(v) && v.length === 7,
        "Choose a colour, or enter one like #1d4ed8.",
      ),
  ),
});

export const parseOrganisation = (input: FormObject) => parse(organisationSchema, input);

// ---------------------------------------------------------------------------
// Compliance zones (6.13)
// ---------------------------------------------------------------------------

const DISTRICT = /^[A-Z]{1,2}([0-9][0-9A-Z]?)?$/;

const complianceZoneSchema = z
  .object({
    name: text("a name", 80),
    requirement: choice(values(COMPLIANCE_REQUIREMENTS), "what vehicles need"),
    min_gross_kg: optionalNumber("the lightest vehicle it applies to", {
      integer: true,
      min: 0,
      max: 60000,
      unit: "kg",
    }),
    max_gross_kg: optionalNumber("the heaviest vehicle it applies to", {
      integer: true,
      min: 0,
      max: 60000,
      unit: "kg",
    }),
    postcode_districts: z.preprocess(
      (v) => (typeof v === "string" ? v : ""),
      z.string().transform((value, ctx) => {
        const parts = [
          ...new Set(
            value
              .toUpperCase()
              .split(/[\s,;]+/)
              .filter(Boolean),
          ),
        ];
        const invalid = parts.filter((p) => !DISTRICT.test(p));
        if (invalid.length) {
          ctx.addIssue({
            code: "custom",
            message: `${invalid.join(", ")} ${invalid.length === 1 ? "isn't a" : "aren't"} postcode area${invalid.length === 1 ? "" : "s"} or district${invalid.length === 1 ? "" : "s"}. Use e.g. EC, SW1A or BR1.`,
          });
          return z.NEVER;
        }
        if (!parts.length) {
          ctx.addIssue({
            code: "custom",
            message: "Enter the postcode areas or districts the zone covers.",
          });
          return z.NEVER;
        }
        return parts.sort();
      }),
    ),
    active: checkbox,
    notes: optionalText(1000),
  })
  .superRefine((zone, ctx) => {
    if (
      zone.min_gross_kg != null &&
      zone.max_gross_kg != null &&
      zone.max_gross_kg < zone.min_gross_kg
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["max_gross_kg"],
        message: "The heaviest must be more than the lightest.",
      });
    }
  });

export const parseComplianceZone = (input: FormObject) => parse(complianceZoneSchema, input);

// ---------------------------------------------------------------------------
// Standing runs (6.12)
// ---------------------------------------------------------------------------

const clock = (label: string) =>
  z.preprocess(
    (v) => (typeof first(v) === "string" ? String(first(v)).trim().slice(0, 5) : v),
    z
      .string(`Enter ${label}.`)
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter ${label} as 24-hour time, e.g. 10:30.`),
  );
const optionalId = z.preprocess(
  (v) => (first(v) === "" || first(v) === "none" || v === undefined ? null : first(v)),
  z.uuid().nullable(),
);

const standingRunSchema = z.object({
  name: text("a name for the run", 80),
  days: checkboxGroup(values(DAYS)).refine((d) => d.length > 0, "Choose at least one day."),
  cutoff_time: clock("the order cut-off"),
  start_time: clock("the start time"),
  depot_id: z.preprocess((v) => first(v), z.uuid("Choose the depot.")),
  vehicle_id: optionalId,
  driver_id: optionalId,
  active: checkbox,
  notes: optionalText(2000),
  site_ids: z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.uuid()).min(1, "Add at least one site.").max(200),
  ),
});

export const parseStandingRun = (input: FormObject) => parse(standingRunSchema, input);
