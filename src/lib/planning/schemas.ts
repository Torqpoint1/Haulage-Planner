import { z } from "zod";
import { CONFIRMATION_METHODS } from "./types";
import {
  errorsByField,
  number,
  optionalText,
  requiredDate,
  type FormObject,
} from "@/lib/settings/form";

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const blank = (v: unknown) => {
  const f = first(v);
  return typeof f === "string" && f.trim() === "" ? undefined : f;
};
const time = (label: string) =>
  z.preprocess(
    blank,
    z
      .string(`Enter ${label}.`)
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter ${label} as hh:mm, e.g. 07:30.`),
  );
const optionalTime = (label: string) =>
  z.preprocess(
    (v) => blank(v) ?? null,
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `Enter ${label} as hh:mm, e.g. 09:30.`)
      .nullable(),
  );
const ids = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()),
);

const loadSchema = z.object({
  load_date: requiredDate("the date"),
  depot_id: z.preprocess(blank, z.uuid("Choose the depot.")),
  // "vehicle:<id>", "haulier:<id>" or blank for not decided yet.
  assignment: z.preprocess(
    (v) => blank(v) ?? "",
    z.string().regex(/^((vehicle|haulier):[0-9a-f-]{36})?$/, "Choose a vehicle or haulier."),
  ),
  driver_ids: ids,
  crew_size: number("the crew size", { integer: true, min: 1, max: 4 }),
  start_time: time("the start time"),
  notes: optionalText(2000),
});

export type LoadInput = {
  load_date: string;
  depot_id: string;
  vehicle_id: string | null;
  haulier_id: string | null;
  driver_ids: string[];
  crew_size: number;
  start_time: string;
  notes: string;
};

export function parseLoad(
  input: FormObject,
): { ok: true; data: LoadInput } | { ok: false; errors: Record<string, string> } {
  const result = loadSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: errorsByField(result.error) };
  const { assignment, ...rest } = result.data;
  const [kind, id] = assignment ? assignment.split(":") : [null, null];
  const data = {
    ...rest,
    vehicle_id: kind === "vehicle" ? id : null,
    haulier_id: kind === "haulier" ? id : null,
  };
  if (data.haulier_id && data.driver_ids.length) {
    return {
      ok: false,
      errors: {
        driver_ids: "A haulier brings their own driver; remove the drivers or choose a vehicle.",
      },
    };
  }
  return { ok: true, data };
}

const stopSchema = z
  .object({
    eta_from: optionalTime("the earliest arrival"),
    eta_to: optionalTime("the latest arrival"),
    booking_ref: optionalText(60),
    booking_slot: optionalTime("the booking slot"),
    confirmed: z.preprocess((v) => first(v) === "on" || first(v) === "true", z.boolean()),
    confirmed_by: optionalText(120),
    confirmation_method: z.preprocess(
      (v) => blank(v) ?? null,
      z.enum(CONFIRMATION_METHODS.map((m) => m.value) as [string, ...string[]]).nullable(),
    ),
    confirmation_note: optionalText(1000),
  })
  .superRefine((s, ctx) => {
    if (s.eta_from && s.eta_to && s.eta_to < s.eta_from) {
      ctx.addIssue({
        code: "custom",
        path: ["eta_to"],
        message: "The latest arrival must be after the earliest.",
      });
    }
  });

export type StopInput = z.infer<typeof stopSchema>;

export function parseStop(
  input: FormObject,
): { ok: true; data: StopInput } | { ok: false; errors: Record<string, string> } {
  const result = stopSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: errorsByField(result.error) };
}
