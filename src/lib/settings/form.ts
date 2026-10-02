import { z } from "zod";

/**
 * Helpers for reading HTML form submissions with Zod. Browsers send
 * everything as strings, leave unticked checkboxes out entirely, and repeat a
 * name once per ticked box in a group.
 */

export type FormObject = Record<string, string | string[]>;

/** FormData → plain object; repeated names become arrays. */
export function formObject(formData: FormData): FormObject {
  const out: FormObject = {};
  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== "string" || key.startsWith("$ACTION")) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = raw;
    else out[key] = Array.isArray(existing) ? [...existing, raw] : [existing, raw];
  }
  return out;
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Required text, trimmed. */
export const text = (label: string, max = 120) =>
  z.preprocess(
    first,
    z
      .string(`Enter ${label}.`)
      .trim()
      .min(1, `Enter ${label}.`)
      .max(max, `Use ${max} characters or fewer.`),
  );

/** Optional text, trimmed; blank becomes "". */
export const optionalText = (max = 2000) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? "" : first(v)),
    z.string().trim().max(max, `Use ${max} characters or fewer.`),
  );

/** A checkbox or toggle: present ("on") means true. */
export const checkbox = z.preprocess((v) => first(v) === "on" || first(v) === "true", z.boolean());

/** A group of checkboxes sharing a name. */
export const checkboxGroup = <T extends string>(allowed: readonly T[]) =>
  z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.enum(allowed as [T, ...T[]])),
  );

type NumberOpts = { min?: number; max?: number; integer?: boolean; unit?: string };

function numberSchema(label: string, { min, max, integer, unit }: NumberOpts) {
  const suffix = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  let n = z.number(`Enter ${label} as a number.`);
  if (integer) n = n.int(`Enter ${label} as a whole number.`);
  if (min !== undefined) n = n.min(min, `${capitalise(label)} must be at least ${min}${suffix}.`);
  if (max !== undefined) n = n.max(max, `${capitalise(label)} must be ${max}${suffix} or less.`);
  return n;
}

const toNumber = (v: unknown) => {
  const value = blankToUndefined(first(v));
  if (value === undefined) return undefined;
  const parsed = Number(String(value).replace(/[£,\s]/g, ""));
  return Number.isNaN(parsed) ? value : parsed;
};

/** Required number (accepts "1,250" and "£12.50"). */
export const number = (label: string, opts: NumberOpts = {}) =>
  z.preprocess(toNumber, numberSchema(label, opts));

/** Optional number; blank becomes null. */
export const optionalNumber = (label: string, opts: NumberOpts = {}) =>
  z.preprocess((v) => toNumber(v) ?? null, numberSchema(label, opts).nullable());

/** A date from a DatePicker's hidden input (yyyy-mm-dd); blank becomes null. */
export const optionalDate = z.preprocess(
  (v) => blankToUndefined(first(v)) ?? null,
  z.iso.date("Enter a valid date.").nullable(),
);

export const requiredDate = (label: string) =>
  z.preprocess((v) => blankToUndefined(first(v)), z.iso.date(`Choose ${label}.`));

/** One of a fixed set of values (a Select). */
export const choice = <T extends string>(allowed: readonly T[], label: string) =>
  z.preprocess(
    (v) => blankToUndefined(first(v)),
    z.enum(allowed as [T, ...T[]], `Choose ${label}.`),
  );

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Field errors keyed by form field name (first message per field). */
export function errorsByField(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
