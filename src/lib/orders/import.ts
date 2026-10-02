import type { CsvTable } from "@/lib/csv";
import { formatLocalDate, parseUkDate } from "@/lib/format";
import { normalisePostcode } from "@/lib/postcode";
import type { Readiness, Urgency } from "./options";

/**
 * Order CSV import (spec 11): map columns to fields, validate every row with
 * plain-English problems, and group rows into orders (one row per line; rows
 * sharing an order ref are lines of the same order).
 */

/** Larger files should be split; keeps a single import quick and the preview readable. */
export const MAX_IMPORT_ROWS = 5000;

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Header names this field is recognised by when suggesting a mapping. */
  aliases: string[];
};

export const ORDER_IMPORT_FIELDS = [
  {
    key: "order_ref",
    label: "Order ref",
    required: true,
    aliases: [
      "order no",
      "order number",
      "order",
      "ref",
      "order reference",
      "sales order",
      "so number",
      "so",
    ],
  },
  {
    key: "customer",
    label: "Customer",
    required: true,
    hint: "Name or account ref",
    aliases: [
      "customer name",
      "account",
      "account ref",
      "account code",
      "client",
      "customer account",
    ],
  },
  {
    key: "site",
    label: "Site",
    hint: "Site name or postcode; can be blank if the customer has one site",
    aliases: [
      "delivery site",
      "site name",
      "postcode",
      "delivery postcode",
      "ship to",
      "deliver to",
      "delivery address postcode",
    ],
  },
  {
    key: "customer_po",
    label: "Customer PO",
    aliases: [
      "po",
      "po number",
      "po no",
      "purchase order",
      "customer po number",
      "customer order no",
    ],
  },
  {
    key: "delivery_note_number",
    label: "Delivery note number",
    aliases: ["delivery note", "dn", "dn number", "dn no", "delivery note no"],
  },
  {
    key: "invoice_number",
    label: "Invoice number",
    aliases: ["invoice", "invoice no", "inv", "inv no"],
  },
  {
    key: "required_date",
    label: "Required date",
    required: true,
    hint: "dd/mm/yyyy",
    aliases: ["delivery date", "required", "due date", "date required", "deliver by", "date"],
  },
  {
    key: "earliest_date",
    label: "Earliest date",
    aliases: ["earliest", "earliest delivery", "not before"],
  },
  { key: "latest_date", label: "Latest date", aliases: ["latest", "latest delivery", "not after"] },
  { key: "urgency", label: "Urgency", hint: "Standard, timed or critical", aliases: ["priority"] },
  {
    key: "readiness",
    label: "Readiness",
    hint: "Not started, in production, part ready or ready",
    aliases: ["ready", "production status", "ready status"],
  },
  {
    key: "missing_items",
    label: "Missing items",
    aliases: ["missing", "outstanding items", "shortages"],
  },
  {
    key: "expected_ready_date",
    label: "Expected ready date",
    aliases: ["ready date", "expected ready", "ready by"],
  },
  {
    key: "delivery_instructions",
    label: "Delivery instructions",
    aliases: ["instructions", "delivery notes", "special instructions"],
  },
  { key: "notes", label: "Notes", aliases: ["comments", "order notes", "comment"] },
  {
    key: "unit_type",
    label: "Unit type",
    required: true,
    hint: "Short code or name, e.g. EUR",
    aliases: ["unit", "units type", "handling unit", "packaging", "pack type", "pallet type"],
  },
  {
    key: "quantity",
    label: "Quantity",
    required: true,
    aliases: ["qty", "units", "no of units", "number of units", "count"],
  },
  {
    key: "weight_per_unit_kg",
    label: "Weight per unit (kg)",
    hint: "Blank uses the unit type's typical weight",
    aliases: ["weight", "unit weight", "weight per unit", "kg", "weight kg"],
  },
  {
    key: "line_description",
    label: "Line description",
    aliases: ["description", "item", "product", "item description", "line"],
  },
] as const satisfies readonly ImportField[];

export type FieldKey = (typeof ORDER_IMPORT_FIELDS)[number]["key"];
/** Field → CSV header. */
export type Mapping = Partial<Record<FieldKey, string>>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Suggest which column holds each field: the organisation's remembered mapping
 * first (where those headers still exist), then exact names and aliases, then
 * headers that contain a field's name.
 */
export function suggestMapping(headers: string[], remembered: Mapping = {}): Mapping {
  const out: Mapping = {};
  const used = new Set<string>();
  const take = (key: FieldKey, header: string | undefined) => {
    if (header && !used.has(header) && !out[key]) {
      out[key] = header;
      used.add(header);
    }
  };
  for (const f of ORDER_IMPORT_FIELDS) {
    const r = remembered[f.key];
    if (r && headers.includes(r)) take(f.key, r);
  }
  for (const f of ORDER_IMPORT_FIELDS) {
    const names = [f.key, f.label, ...f.aliases].map(norm);
    take(
      f.key,
      headers.find((h) => names.includes(norm(h)) && !used.has(h)),
    );
  }
  for (const f of ORDER_IMPORT_FIELDS) {
    const label = norm(f.label);
    take(
      f.key,
      headers.find((h) => !used.has(h) && norm(h).includes(label)),
    );
  }
  return out;
}

export function missingRequired(mapping: Mapping): string[] {
  return ORDER_IMPORT_FIELDS.filter((f) => "required" in f && f.required && !mapping[f.key]).map(
    (f) => f.label,
  );
}

export type ImportLookups = {
  customers: { id: string; name: string; account_ref: string }[];
  sites: {
    id: string;
    customer_id: string;
    name: string;
    postcode: string;
    delivery_instructions?: string;
  }[];
  unitTypes: { id: string; name: string; short_code: string; typical_weight_kg: number }[];
  /** Order refs already in use, lower-cased. */
  existingRefs: Set<string>;
};

export type PlannedOrder = {
  order: {
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
    delivery_instructions: string;
    notes: string;
  };
  lines: {
    unit_type_id: string;
    quantity: number;
    weight_per_unit_kg: number;
    description: string;
  }[];
  /** Spreadsheet row numbers this order came from. */
  rows: number[];
};

export type RowResult = { row: number; orderRef: string; errors: string[] };

export type ImportPlan = {
  orders: PlannedOrder[];
  rows: RowResult[];
  /** Rows that will be skipped, with reasons. */
  rejected: RowResult[];
  lineCount: number;
};

/** Spreadsheet row number for data row i (the header is row 1). */
const rowNumber = (i: number) => i + 2;

function toIsoDate(raw: string): string | null | "invalid" {
  const value = raw.trim();
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d.getDate() === Number(iso[3]) && d.getMonth() === Number(iso[2]) - 1
      ? value
      : "invalid";
  }
  const uk = parseUkDate(value);
  if (!uk) return "invalid";
  const dd = String(uk.getDate()).padStart(2, "0");
  const mm = String(uk.getMonth() + 1).padStart(2, "0");
  return `${uk.getFullYear()}-${mm}-${dd}`;
}

const URGENCY_WORDS: Record<string, Urgency> = {
  "": "standard",
  standard: "standard",
  normal: "standard",
  s: "standard",
  timed: "timed",
  t: "timed",
  "timed delivery": "timed",
  critical: "critical",
  urgent: "critical",
  c: "critical",
  asap: "critical",
};

const READINESS_WORDS: Record<string, Readiness> = {
  "": "not_started",
  "not started": "not_started",
  no: "not_started",
  none: "not_started",
  "in production": "in_production",
  production: "in_production",
  wip: "in_production",
  "in progress": "in_production",
  "part ready": "part_ready",
  part: "part_ready",
  partial: "part_ready",
  "partly ready": "part_ready",
  ready: "ready",
  yes: "ready",
  complete: "ready",
  done: "ready",
};

const looksLikePostcode = (v: string) => /\d/.test(v) && /^[a-z]{1,2}\d/i.test(v.trim());

export function planOrderImport(
  table: CsvTable,
  mapping: Mapping,
  lookups: ImportLookups,
): ImportPlan {
  const col = Object.fromEntries(
    ORDER_IMPORT_FIELDS.map((f) => [
      f.key,
      mapping[f.key] ? table.headers.indexOf(mapping[f.key]!) : -1,
    ]),
  ) as Record<FieldKey, number>;
  const get = (row: string[], key: FieldKey) => (col[key] >= 0 ? (row[col[key]] ?? "").trim() : "");

  const customersByRef = new Map(
    lookups.customers.filter((c) => c.account_ref).map((c) => [c.account_ref.toLowerCase(), c]),
  );
  const unitsByCode = new Map(lookups.unitTypes.map((u) => [u.short_code.toLowerCase(), u]));
  const unitsByName = new Map(lookups.unitTypes.map((u) => [u.name.toLowerCase(), u]));

  const results: RowResult[] = [];
  const groups = new Map<
    string,
    { order: PlannedOrder; firstRow: number; raw: Record<string, string>; rowIndexes: number[] }
  >();

  table.rows.forEach((row, i) => {
    const errors: string[] = [];
    const orderRef = get(row, "order_ref");
    const result: RowResult = { row: rowNumber(i), orderRef, errors };
    results.push(result);

    if (!orderRef) errors.push("Order ref is missing.");
    else if (orderRef.length > 40) errors.push("Order ref is longer than 40 characters.");
    else if (lookups.existingRefs.has(orderRef.toLowerCase()))
      errors.push(`Order ${orderRef} already exists.`);

    // Customer
    const customerValue = get(row, "customer");
    let customer: ImportLookups["customers"][number] | undefined;
    if (!customerValue) errors.push("Customer is missing.");
    else {
      customer = customersByRef.get(customerValue.toLowerCase());
      if (!customer) {
        const named = lookups.customers.filter(
          (c) => c.name.toLowerCase() === customerValue.toLowerCase(),
        );
        if (named.length === 1) customer = named[0];
        else if (named.length > 1)
          errors.push(
            `More than one customer is called “${customerValue}”. Use their account ref instead.`,
          );
        else
          errors.push(
            `No customer called “${customerValue}”. Check the spelling, or add them on the Customers page first.`,
          );
      }
    }

    // Site: by postcode, by name, or the customer's only site.
    let site: ImportLookups["sites"][number] | undefined;
    if (customer) {
      const sites = lookups.sites.filter((s) => s.customer_id === customer!.id);
      const siteValue = get(row, "site");
      if (!siteValue) {
        if (sites.length === 1) site = sites[0];
        else if (!sites.length)
          errors.push(
            `${customer.name} has no delivery sites yet. Add one on the Customers page first.`,
          );
        else
          errors.push(
            `${customer.name} has ${sites.length} sites. Say which one, by name or postcode.`,
          );
      } else if (looksLikePostcode(siteValue)) {
        const postcode = normalisePostcode(siteValue);
        if (!postcode) errors.push(`“${siteValue}” isn't a full UK postcode.`);
        else {
          const matches = sites.filter((s) => s.postcode === postcode);
          if (matches.length === 1) site = matches[0];
          else if (matches.length > 1)
            errors.push(
              `${customer.name} has more than one site at ${postcode}. Use the site name instead.`,
            );
          else
            errors.push(
              `${customer.name} has no site at ${postcode}. Add the site first, or check the postcode.`,
            );
        }
      } else {
        site = sites.find((s) => s.name.toLowerCase() === siteValue.toLowerCase());
        if (!site) errors.push(`${customer.name} has no site called “${siteValue}”.`);
      }
    }

    // Dates
    const dates: Record<
      "required_date" | "earliest_date" | "latest_date" | "expected_ready_date",
      string | null
    > = {
      required_date: null,
      earliest_date: null,
      latest_date: null,
      expected_ready_date: null,
    };
    for (const key of [
      "required_date",
      "earliest_date",
      "latest_date",
      "expected_ready_date",
    ] as const) {
      const raw = get(row, key);
      const parsed = toIsoDate(raw);
      const label = ORDER_IMPORT_FIELDS.find((f) => f.key === key)!.label;
      if (parsed === "invalid")
        errors.push(`${label} “${raw}” isn't a valid date. Use dd/mm/yyyy.`);
      else dates[key] = parsed;
    }
    if (!get(row, "required_date")) errors.push("Required date is missing.");
    if (dates.required_date && dates.earliest_date && dates.earliest_date > dates.required_date) {
      errors.push("Earliest date is after the required date.");
    }
    if (dates.required_date && dates.latest_date && dates.latest_date < dates.required_date) {
      errors.push("Latest date is before the required date.");
    }

    const urgencyRaw = get(row, "urgency");
    const urgency = URGENCY_WORDS[norm(urgencyRaw)];
    if (!urgency)
      errors.push(`Urgency “${urgencyRaw}” isn't recognised. Use standard, timed or critical.`);
    const readinessRaw = get(row, "readiness");
    const readiness = READINESS_WORDS[norm(readinessRaw)];
    if (!readiness)
      errors.push(
        `Readiness “${readinessRaw}” isn't recognised. Use not started, in production, part ready or ready.`,
      );

    // The line
    const unitValue = get(row, "unit_type");
    const unit = unitValue
      ? (unitsByCode.get(unitValue.toLowerCase()) ?? unitsByName.get(unitValue.toLowerCase()))
      : undefined;
    if (!unitValue) errors.push("Unit type is missing.");
    else if (!unit) {
      const codes = lookups.unitTypes
        .map((u) => u.short_code)
        .slice(0, 6)
        .join(", ");
      errors.push(
        `No unit type “${unitValue}”. Use a short code${codes ? ` such as ${codes}` : ""}.`,
      );
    }
    const qtyRaw = get(row, "quantity").replace(/,/g, "");
    const quantity = Number(qtyRaw);
    if (!qtyRaw) errors.push("Quantity is missing.");
    else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      errors.push(`Quantity “${get(row, "quantity")}” must be a whole number from 1 to 10,000.`);
    }
    const weightRaw = get(row, "weight_per_unit_kg")
      .replace(/,/g, "")
      .replace(/\s*kg$/i, "");
    let weight = unit ? Number(unit.typical_weight_kg) : 0;
    if (weightRaw) {
      weight = Number(weightRaw);
      if (!Number.isFinite(weight) || weight < 0 || weight > 50000) {
        errors.push(`Weight “${get(row, "weight_per_unit_kg")}” must be a number of kg.`);
      }
    }

    for (const [key, max] of [
      ["customer_po", 60],
      ["delivery_note_number", 60],
      ["invoice_number", 60],
      ["missing_items", 1000],
      ["delivery_instructions", 2000],
      ["notes", 4000],
      ["line_description", 500],
    ] as const) {
      if (get(row, key).length > max) {
        errors.push(
          `${ORDER_IMPORT_FIELDS.find((f) => f.key === key)!.label} is longer than ${max} characters.`,
        );
      }
    }

    if (errors.length || !customer || !site || !unit || !orderRef) return;

    const line = {
      unit_type_id: unit.id,
      quantity,
      weight_per_unit_kg: weight,
      description: get(row, "line_description"),
    };
    const groupKey = orderRef.toLowerCase();
    const existing = groups.get(groupKey);

    // Order-level values; rows of the same order must agree.
    const raw: Record<string, string> = {
      customer: customer.id,
      site: site.id,
      required_date: dates.required_date ?? "",
      customer_po: get(row, "customer_po"),
      delivery_note_number: get(row, "delivery_note_number"),
      invoice_number: get(row, "invoice_number"),
    };
    if (existing) {
      const differs = Object.entries(raw).filter(
        ([k, v]) => v && existing.raw[k] && v !== existing.raw[k],
      );
      if (differs.length) {
        errors.push(
          `Order details differ from row ${existing.firstRow} for the same order ref (${differs.map(([k]) => k.replace(/_/g, " ")).join(", ")}).`,
        );
        return;
      }
      existing.order.lines.push(line);
      existing.order.rows.push(result.row);
      existing.rowIndexes.push(results.length - 1);
      return;
    }

    groups.set(groupKey, {
      firstRow: result.row,
      raw,
      rowIndexes: [results.length - 1],
      order: {
        order: {
          customer_id: customer.id,
          site_id: site.id,
          order_ref: orderRef,
          customer_po: raw.customer_po,
          delivery_note_number: raw.delivery_note_number,
          invoice_number: raw.invoice_number,
          required_date: dates.required_date!,
          earliest_date: dates.earliest_date,
          latest_date: dates.latest_date,
          urgency: urgency!,
          readiness: readiness!,
          missing_items: get(row, "missing_items"),
          expected_ready_date: readiness === "ready" ? null : dates.expected_ready_date,
          // Blank uses the site's own instructions (spec 6.7: pre-filled from site).
          delivery_instructions:
            get(row, "delivery_instructions") || site.delivery_instructions || "",
          notes: get(row, "notes"),
        },
        lines: [line],
        rows: [result.row],
      },
    });
  });

  // An order is only imported if every one of its rows is fine.
  const badByRef = new Map<string, number>();
  for (const r of results) {
    if (r.errors.length && r.orderRef) {
      const key = r.orderRef.toLowerCase();
      if (!badByRef.has(key)) badByRef.set(key, r.row);
    }
  }
  const orders: PlannedOrder[] = [];
  for (const [key, group] of groups) {
    const badRow = badByRef.get(key);
    if (badRow !== undefined) {
      for (const idx of group.rowIndexes) {
        results[idx].errors.push(
          `Not imported because row ${badRow} of the same order has a problem.`,
        );
      }
    } else orders.push(group.order);
  }

  const rejected = results.filter((r) => r.errors.length);
  return {
    orders,
    rows: results,
    rejected,
    lineCount: orders.reduce((n, o) => n + o.lines.length, 0),
  };
}

/** Today's date in the format the template uses, for example rows. */
export const exampleDate = () => formatLocalDate(new Date(Date.now() + 3 * 86_400_000));
