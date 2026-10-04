import type { CsvTable } from "@/lib/csv";
import {
  fieldReader,
  rowNumber,
  yesNo,
  type FieldMapping,
  type ImportField,
  type ImportProblem,
} from "@/lib/import/mapping";
import { normalisePostcode } from "@/lib/postcode";

/**
 * Customer and site CSV import (spec 11): one row per delivery site; rows for
 * the same customer (by account ref, or name) become one customer. Existing
 * customers are matched and get the new sites added; nothing existing changes.
 */

export const CUSTOMER_IMPORT_FIELDS = [
  {
    key: "customer",
    label: "Customer",
    required: true,
    aliases: ["customer name", "company", "company name", "account name", "client", "name"],
  },
  {
    key: "account_ref",
    label: "Account ref",
    hint: "Matches existing customers when given",
    aliases: ["account", "account code", "account number", "customer code", "ref", "code"],
  },
  {
    key: "site_name",
    label: "Site name",
    hint: "Blank uses the postcode",
    aliases: ["site", "delivery site", "location", "branch", "depot name"],
  },
  {
    key: "address",
    label: "Address",
    aliases: ["delivery address", "street", "address 1", "address line 1", "full address"],
  },
  {
    key: "postcode",
    label: "Postcode",
    required: true,
    aliases: ["post code", "postal code", "delivery postcode", "zip"],
  },
  {
    key: "contact_name",
    label: "Contact name",
    aliases: ["contact", "site contact", "main contact"],
  },
  {
    key: "contact_phone",
    label: "Contact phone",
    aliases: ["phone", "telephone", "tel", "mobile", "contact number"],
  },
  { key: "contact_email", label: "Contact email", aliases: ["email", "e-mail", "email address"] },
  {
    key: "delivery_instructions",
    label: "Delivery instructions",
    aliases: ["instructions", "delivery notes", "special instructions"],
  },
  {
    key: "booking_required",
    label: "Booking required",
    hint: "Yes or no",
    aliases: ["booking", "book in", "needs booking"],
  },
  {
    key: "forklift",
    label: "Forklift on site",
    hint: "Yes or no",
    aliases: ["forklift", "has forklift", "fork lift"],
  },
] as const satisfies readonly ImportField[];

export type CustomerImportLookups = {
  customers: { id: string; name: string; account_ref: string }[];
  sites: { customer_id: string; name: string; postcode: string }[];
};

export type PlannedSite = {
  name: string;
  address: string;
  postcode: string;
  delivery_instructions: string;
  booking_required: boolean;
  site_equipment: string[];
  contact: { name: string; phone: string; email: string } | null;
};

export type PlannedCustomer = {
  /** Set when the customer already exists. */
  existingId: string | null;
  name: string;
  account_ref: string;
  sites: PlannedSite[];
  rows: number[];
};

export type CustomerImportPlan = {
  customers: PlannedCustomer[];
  siteCount: number;
  newCustomers: number;
  rowCount: number;
  rejected: ImportProblem[];
};

const PHONE = /^[0-9 +()-]{0,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function planCustomerImport(
  table: CsvTable,
  mapping: FieldMapping,
  lookups: CustomerImportLookups,
): CustomerImportPlan {
  const get = fieldReader(CUSTOMER_IMPORT_FIELDS, table.headers, mapping);
  const byRef = new Map(
    lookups.customers.filter((c) => c.account_ref).map((c) => [c.account_ref.toLowerCase(), c]),
  );
  const byName = new Map(lookups.customers.map((c) => [c.name.trim().toLowerCase(), c]));
  const existingSites = new Set(
    lookups.sites.map((s) => `${s.customer_id}|${s.name.trim().toLowerCase()}|${s.postcode}`),
  );

  const groups = new Map<string, PlannedCustomer>();
  const rejected: ImportProblem[] = [];
  const seenSites = new Set<string>();

  table.rows.forEach((row, i) => {
    const n = rowNumber(i);
    const errors: string[] = [];
    const name = get(row, "customer");
    const ref = get(row, "account_ref");
    if (!name) errors.push("Enter the customer's name.");
    if (name.length > 120) errors.push("The customer's name is over 120 characters.");
    if (ref.length > 40) errors.push("The account ref is over 40 characters.");

    const rawPostcode = get(row, "postcode");
    const postcode = normalisePostcode(rawPostcode);
    if (!rawPostcode) errors.push("Enter the site's postcode.");
    else if (!postcode) errors.push(`“${rawPostcode}” isn't a UK postcode.`);
    const siteName = get(row, "site_name") || postcode || "";
    if (siteName.length > 120) errors.push("The site name is over 120 characters.");
    const address = get(row, "address");
    if (address.length > 500) errors.push("The address is over 500 characters.");

    const contactName = get(row, "contact_name");
    const phone = get(row, "contact_phone");
    const email = get(row, "contact_email");
    if (phone && !PHONE.test(phone))
      errors.push(`“${phone}” isn't a phone number (digits, spaces and + ( ) - only).`);
    if (email && !EMAIL.test(email)) errors.push(`“${email}” isn't an email address.`);
    if ((phone || email) && !contactName)
      errors.push("Add the contact's name for that phone or email.");

    const booking = yesNo(get(row, "booking_required"));
    if (booking === null)
      errors.push(`Booking required should be yes or no, not “${get(row, "booking_required")}”.`);
    const forklift = yesNo(get(row, "forklift"));
    if (forklift === null)
      errors.push(`Forklift on site should be yes or no, not “${get(row, "forklift")}”.`);
    const instructions = get(row, "delivery_instructions");
    if (instructions.length > 2000)
      errors.push("The delivery instructions are over 2,000 characters.");

    const existing =
      (ref && byRef.get(ref.toLowerCase())) || (!ref ? byName.get(name.toLowerCase()) : undefined);
    const key = existing
      ? `id:${existing.id}`
      : ref
        ? `ref:${ref.toLowerCase()}`
        : `name:${name.toLowerCase()}`;
    const group = groups.get(key);
    if (group && !existing && group.name.toLowerCase() !== name.toLowerCase()) {
      errors.push(`Account ref ${ref} is used for both “${group.name}” and “${name}”.`);
    }
    if (postcode && !errors.length) {
      const siteKey = `${key}|${siteName.toLowerCase()}|${postcode}`;
      if (existing && existingSites.has(`${existing.id}|${siteName.toLowerCase()}|${postcode}`)) {
        errors.push(`${existing.name} already has ${siteName} at ${postcode}.`);
      } else if (seenSites.has(siteKey)) {
        errors.push(`${siteName} at ${postcode} is listed twice for this customer.`);
      } else seenSites.add(siteKey);
    }

    if (errors.length) {
      rejected.push({ row: n, ref: name || ref, errors });
      return;
    }
    const target =
      group ??
      ({
        existingId: existing?.id ?? null,
        name: existing?.name ?? name,
        account_ref: existing?.account_ref ?? ref,
        sites: [],
        rows: [],
      } satisfies PlannedCustomer);
    target.sites.push({
      name: siteName,
      address,
      postcode: postcode!,
      delivery_instructions: instructions,
      booking_required: booking ?? false,
      site_equipment: forklift ? ["forklift"] : [],
      contact: contactName ? { name: contactName, phone, email } : null,
    });
    target.rows.push(n);
    groups.set(key, target);
  });

  const customers = [...groups.values()];
  return {
    customers,
    siteCount: customers.reduce((n, c) => n + c.sites.length, 0),
    newCustomers: customers.filter((c) => !c.existingId).length,
    rowCount: table.rows.length,
    rejected,
  };
}

/** Wording and template for the customer import wizard. */
export function customerImportCopy() {
  const example: Record<string, string> = {
    customer: "Hillside Builders",
    account_ref: "HB001",
    site_name: "Stroud yard",
    address: "London Road, Stroud",
    postcode: "GL5 3QF",
    contact_name: "Gemma Hill",
    contact_phone: "01453 000123",
    delivery_instructions: "Call 30 minutes before arrival.",
    booking_required: "No",
    forklift: "Yes",
  };
  return {
    noun: ["site", "sites"] as [string, string],
    fields: CUSTOMER_IMPORT_FIELDS,
    refLabel: "Customer",
    fileHint: "One row per delivery site; rows for the same customer become one customer.",
    needHint: "You need the customer's name and each site's postcode.",
    templateName: "customer-import-template.csv",
    templateRows: [
      example,
      { ...example, site_name: "Cirencester branch", postcode: "GL7 1AA", forklift: "No" },
    ],
    problemsName: "customer-import-problems",
    doneHref: "/customers",
    doneLabel: "View customers",
  };
}
