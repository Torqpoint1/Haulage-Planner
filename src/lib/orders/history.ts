import { formatIsoDate } from "@/lib/format";
import { optionFor, ORDER_STATUS, READINESS, URGENCY } from "./options";

/** An audit_log row for an order, one of its lines or one of its documents. */
export type AuditEntry = {
  id: string;
  table_name: string;
  action: "insert" | "update" | "delete";
  actor_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type HistoryEvent = { key: string; at: string; actorId: string | null; changes: string[] };

const FIELDS: Record<
  string,
  { label: string; kind?: "date" | "urgency" | "readiness" | "status" }
> = {
  order_ref: { label: "Order ref" },
  customer_po: { label: "Customer PO" },
  delivery_note_number: { label: "Delivery note" },
  invoice_number: { label: "Invoice" },
  required_date: { label: "Required date", kind: "date" },
  earliest_date: { label: "Earliest date", kind: "date" },
  latest_date: { label: "Latest date", kind: "date" },
  urgency: { label: "Urgency", kind: "urgency" },
  readiness: { label: "Readiness", kind: "readiness" },
  missing_items: { label: "Missing items" },
  expected_ready_date: { label: "Expected ready date", kind: "date" },
  status: { label: "Status", kind: "status" },
  delivery_instructions: { label: "Delivery instructions" },
  notes: { label: "Notes" },
  customer_id: { label: "Customer" },
  site_id: { label: "Delivery site" },
};

function show(kind: (typeof FIELDS)[string]["kind"], value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  const v = String(value);
  switch (kind) {
    case "date":
      return formatIsoDate(v);
    case "urgency":
      return optionFor(URGENCY, v).label;
    case "readiness":
      return optionFor(READINESS, v).label;
    case "status":
      return optionFor(ORDER_STATUS, v).label;
    default:
      return v.length > 60 ? `“${v.slice(0, 57)}…”` : `“${v}”`;
  }
}

function orderChanges(e: AuditEntry): string[] {
  if (e.action === "insert") return ["Order created"];
  if (e.action === "delete") return ["Order deleted"];
  const out: string[] = [];
  for (const [key, { label, kind }] of Object.entries(FIELDS)) {
    const a = e.before?.[key] ?? null;
    const b = e.after?.[key] ?? null;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    // Ids mean nothing to people; say what changed without them.
    out.push(
      key.endsWith("_id") ? `${label} changed` : `${label}: ${show(kind, a)} → ${show(kind, b)}`,
    );
  }
  return out;
}

const lineKey = (row: Record<string, unknown> | null) =>
  row
    ? JSON.stringify([
        row.unit_type_id,
        Number(row.quantity),
        Number(row.weight_per_unit_kg),
        row.description,
      ])
    : "";

/**
 * Turns raw audit rows into readable events, newest first. Rows written in
 * one transaction share a timestamp, so they're grouped into one event; a
 * save that rewrote the lines without changing them says nothing about lines.
 */
export function describeHistory(entries: AuditEntry[]): HistoryEvent[] {
  const groups = new Map<string, AuditEntry[]>();
  for (const e of entries) {
    const key = `${e.created_at}|${e.actor_id ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const events: HistoryEvent[] = [];
  for (const [key, group] of groups) {
    const changes: string[] = [];
    for (const e of group.filter((g) => g.table_name === "orders"))
      changes.push(...orderChanges(e));

    const lines = group.filter((g) => g.table_name === "order_lines");
    const removed = lines
      .filter((l) => l.action === "delete")
      .map((l) => lineKey(l.before))
      .sort();
    const added = lines
      .filter((l) => l.action === "insert")
      .map((l) => lineKey(l.after))
      .sort();
    const edited = lines.some((l) => l.action === "update");
    const created = changes.includes("Order created");
    if (!created && (edited || JSON.stringify(removed) !== JSON.stringify(added)))
      changes.push("Lines changed");

    for (const d of group.filter((g) => g.table_name === "order_attachments")) {
      const name = String((d.after ?? d.before)?.file_name ?? "a document");
      if (d.action === "insert") changes.push(`Document added: ${name}`);
      if (d.action === "delete") changes.push(`Document removed: ${name}`);
    }
    if (changes.length) {
      events.push({ key, at: group[0].created_at, actorId: group[0].actor_id, changes });
    }
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
