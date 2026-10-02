import { z } from "zod";
import {
  choice,
  errorsByField,
  optionalDate,
  optionalText,
  requiredDate,
  text,
  type FormObject,
} from "@/lib/settings/form";
import { values, type Parsed } from "@/lib/settings/schemas";
import { READINESS, URGENCY } from "./options";

/** Validation for the order form (spec 6.7). Lines arrive as line_<n>_<field>. */

const uuid = (message: string) =>
  z.preprocess((v) => (v === "" || v === "none" ? undefined : v), z.uuid(message));

const orderSchema = z
  .object({
    customer_id: uuid("Choose the customer."),
    site_id: uuid("Choose the delivery site."),
    order_ref: text("an order ref", 40),
    customer_po: optionalText(60),
    delivery_note_number: optionalText(60),
    invoice_number: optionalText(60),
    required_date: requiredDate("the required delivery date"),
    earliest_date: optionalDate,
    latest_date: optionalDate,
    urgency: choice(values(URGENCY), "the urgency"),
    readiness: choice(values(READINESS), "the readiness"),
    missing_items: optionalText(1000),
    expected_ready_date: optionalDate,
    delivery_instructions: optionalText(2000),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.earliest_date && v.earliest_date > v.required_date) {
      ctx.addIssue({
        code: "custom",
        path: ["earliest_date"],
        message: "The earliest date can't be after the required date.",
      });
    }
    if (v.latest_date && v.latest_date < v.required_date) {
      ctx.addIssue({
        code: "custom",
        path: ["latest_date"],
        message: "The latest date can't be before the required date.",
      });
    }
    if (v.readiness !== "ready" && v.readiness !== "not_started" && !v.expected_ready_date) {
      ctx.addIssue({
        code: "custom",
        path: ["expected_ready_date"],
        message: "Enter when it's expected to be ready.",
      });
    }
  })
  .transform((v) => ({
    ...v,
    expected_ready_date: v.readiness === "ready" ? null : v.expected_ready_date,
    missing_items: v.readiness === "ready" ? "" : v.missing_items,
  }));

export type OrderInput = z.output<typeof orderSchema>;
export type LineInput = {
  unit_type_id: string;
  quantity: number;
  weight_per_unit_kg: number;
  description: string;
};

export function parseOrder(input: FormObject): Parsed<{ order: OrderInput; lines: LineInput[] }> {
  const result = orderSchema.safeParse(input);
  const errors: Record<string, string> = result.success ? {} : errorsByField(result.error);

  const indexes = [
    ...new Set(
      Object.keys(input)
        .map((k) => /^line_(\d+)_/.exec(k)?.[1])
        .filter((v): v is string => Boolean(v)),
    ),
  ].sort((a, b) => Number(a) - Number(b));

  const lines: LineInput[] = [];
  for (const i of indexes) {
    const get = (f: string) => String(input[`line_${i}_${f}`] ?? "").trim();
    const unit = get("unit_type_id") === "none" ? "" : get("unit_type_id");
    const qty = get("quantity");
    const weight = get("weight_per_unit_kg").replace(/,/g, "");
    const description = get("description");
    if (!unit && !qty && !description) continue; // An empty row is ignored.
    if (!unit) errors[`line_${i}_unit_type_id`] = "Choose a unit type.";
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      errors[`line_${i}_quantity`] = "Enter a whole number from 1 to 10,000.";
    }
    const w = weight === "" ? NaN : Number(weight);
    if (!Number.isFinite(w) || w < 0 || w > 50000)
      errors[`line_${i}_weight_per_unit_kg`] = "Enter the weight per unit in kg.";
    if (description.length > 500) errors[`line_${i}_description`] = "Use 500 characters or fewer.";
    lines.push({ unit_type_id: unit, quantity, weight_per_unit_kg: w, description });
  }
  if (!lines.length) errors.lines = "Add at least one line: what's being delivered.";

  if (!result.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { order: result.data, lines } };
}
