import { describe, expect, it } from "vitest";
import { describeHistory, type AuditEntry } from "../history";

const at = (t: string) => `2026-10-02T${t}:00+00:00`;
let n = 0;
const entry = (e: Partial<AuditEntry>): AuditEntry => ({
  id: String(n++),
  table_name: "orders",
  action: "update",
  actor_id: "u1",
  before: null,
  after: null,
  created_at: at("09:00"),
  ...e,
});
const line = { unit_type_id: "dp", quantity: 2, weight_per_unit_kg: 300, description: "" };

describe("describeHistory", () => {
  it("describes creation once, without a separate lines event", () => {
    const events = describeHistory([
      entry({ action: "insert", after: { readiness: "not_started" } }),
      entry({ table_name: "order_lines", action: "insert", after: line }),
    ]);
    expect(events).toEqual([expect.objectContaining({ changes: ["Order created"] })]);
  });

  it("lists changed fields in plain English, newest first", () => {
    const events = describeHistory([
      entry({ action: "insert", after: {} }),
      entry({
        created_at: at("10:00"),
        before: { readiness: "not_started", required_date: "2026-10-05", customer_id: "a" },
        after: { readiness: "ready", required_date: "2026-10-06", customer_id: "b" },
      }),
    ]);
    expect(events[0].changes).toEqual([
      "Required date: 05/10/2026 → 06/10/2026",
      "Readiness: Not started → Ready",
      "Customer changed",
    ]);
    expect(events[1].changes).toEqual(["Order created"]);
  });

  it("ignores lines rewritten without change but reports real line changes", () => {
    const same = describeHistory([
      entry({ before: { notes: "" }, after: { notes: "" } }),
      entry({ table_name: "order_lines", action: "delete", before: line }),
      entry({ table_name: "order_lines", action: "insert", after: line }),
    ]);
    expect(same).toEqual([]);
    const changed = describeHistory([
      entry({ table_name: "order_lines", action: "delete", before: line }),
      entry({ table_name: "order_lines", action: "insert", after: { ...line, quantity: 3 } }),
    ]);
    expect(changed[0].changes).toEqual(["Lines changed"]);
  });

  it("names documents added and removed", () => {
    const events = describeHistory([
      entry({ table_name: "order_attachments", action: "insert", after: { file_name: "dn.pdf" } }),
      entry({
        created_at: at("11:00"),
        table_name: "order_attachments",
        action: "delete",
        before: { file_name: "dn.pdf" },
      }),
    ]);
    expect(events.map((e) => e.changes[0])).toEqual([
      "Document removed: dn.pdf",
      "Document added: dn.pdf",
    ]);
  });
});
