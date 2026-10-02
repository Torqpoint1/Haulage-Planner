import { z } from "zod";
import {
  checkbox,
  checkboxGroup,
  errorsByField,
  optionalNumber,
  optionalText,
  text,
  type FormObject,
} from "@/lib/settings/form";
import { VEHICLE_TYPES } from "@/lib/settings/options";
import {
  parse,
  parseWeeklyHours,
  phone,
  postcode,
  values,
  type OpeningHours,
  type Parsed,
} from "@/lib/settings/schemas";
import { SITE_EQUIPMENT } from "./options";

/** Validation for customer, site and contact forms (spec 6.6). */

const customerSchema = z.object({
  name: text("the customer's name"),
  account_ref: optionalText(40),
  default_delivery_instructions: optionalText(2000),
  notes: optionalText(4000),
});

export const parseCustomer = (input: FormObject) => parse(customerSchema, input);

const siteSchema = z
  .object({
    name: text("a name for the site"),
    address: optionalText(500),
    postcode,
    // Access
    max_vehicle_type: z.preprocess(
      (v) => (v === "" || v === "none" || v === undefined ? null : v),
      z.enum(values(VEHICLE_TYPES) as [string, ...string[]]).nullable(),
    ),
    max_length_m: optionalNumber("the maximum vehicle length", { min: 1, max: 25, unit: "m" }),
    max_weight_kg: optionalNumber("the maximum vehicle weight", {
      integer: true,
      min: 1,
      max: 60000,
      unit: "kg",
    }),
    no_hgvs: checkbox,
    height_limit_m: optionalNumber("the height limit", { min: 1, max: 10, unit: "m" }),
    narrow_access_note: optionalText(500),
    parking_note: optionalText(500),
    // Unloading
    site_equipment: checkboxGroup(values(SITE_EQUIPMENT)),
    handball_allowed: checkbox,
    handball_people: optionalNumber("people needed for handballing", {
      integer: true,
      min: 1,
      max: 6,
    }),
    crane_drop_allowed: checkbox,
    // Booking
    booking_required: checkbox,
    booking_lead_hours: optionalNumber("the booking lead time", {
      integer: true,
      min: 0,
      max: 720,
      unit: "hours",
    }),
    how_to_book: optionalText(500),
    // Rules
    ppe_required: checkbox,
    induction_required: checkbox,
    contact_must_be_present: checkbox,
    delivery_instructions: optionalText(2000),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.handball_allowed && v.handball_people === null) {
      ctx.addIssue({
        code: "custom",
        path: ["handball_people"],
        message: "Say how many people are needed to handball.",
      });
    }
    if (v.booking_required && !v.how_to_book && v.booking_lead_hours === null) {
      ctx.addIssue({
        code: "custom",
        path: ["how_to_book"],
        message: "Say how to book, or how much notice they need.",
      });
    }
  })
  .transform((v) => ({
    ...v,
    handball_people: v.handball_allowed ? v.handball_people : null,
    booking_lead_hours: v.booking_required ? v.booking_lead_hours : null,
  }));

export type SiteInput = z.output<typeof siteSchema> & {
  opening_hours: OpeningHours;
  delivery_windows: OpeningHours;
};

export function parseSite(input: FormObject): Parsed<SiteInput> {
  const result = siteSchema.safeParse(input);
  const opening = parseWeeklyHours(input, "hours");
  const windows = parseWeeklyHours(input, "window", {
    closedWord: "no window",
    closeWord: "the window's end",
  });
  const errors = {
    ...(result.success ? {} : errorsByField(result.error)),
    ...opening.errors,
    ...windows.errors,
  };
  if (!result.success || Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: { ...result.data, opening_hours: opening.hours, delivery_windows: windows.hours },
  };
}

const contactSchema = z.object({
  name: text("the contact's name"),
  job_role: optionalText(80),
  phone,
  email: optionalText(254).refine(
    (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    "Enter a valid email address.",
  ),
  site_id: z.preprocess(
    (v) => (v === "" || v === "none" || v === undefined ? null : v),
    z.uuid().nullable(),
  ),
});

export const parseContact = (input: FormObject) => parse(contactSchema, input);
