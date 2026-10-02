import type { Readiness, Urgency, OrderStatus } from "./options";

export type OrderLineRow = {
  id?: string;
  unit_type_id: string;
  quantity: number;
  weight_per_unit_kg: number;
  description: string;
  position?: number;
  unit_type: { short_code: string; name: string } | null;
};

export type OrderRow = {
  id: string;
  customer_id: string;
  site_id: string;
  order_ref: string;
  customer_po: string;
  delivery_note_number: string;
  invoice_number: string;
  required_date: string;
  earliest_date: string | null;
  latest_date: string | null;
  urgency: Urgency;
  readiness: Readiness;
  missing_items: string;
  expected_ready_date: string | null;
  status: OrderStatus;
  delivery_instructions: string;
  notes: string;
  created_at: string;
  customer: { id: string; name: string; account_ref: string } | null;
  site: { id: string; name: string; postcode: string } | null;
  lines: OrderLineRow[];
};

/** The select used wherever orders are listed. */
export const ORDER_SELECT =
  "*, customer:customers(id, name, account_ref), site:sites(id, name, postcode), lines:order_lines(id, unit_type_id, quantity, weight_per_unit_kg, description, position, unit_type:unit_types(short_code, name))";

export const OPEN_STATUSES: OrderStatus[] = [
  "unplanned",
  "planned",
  "loaded",
  "out_for_delivery",
  "failed",
];
