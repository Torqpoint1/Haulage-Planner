import { describe, expect, it } from "vitest";
import { standingRunOrders, type RunOrderCandidate } from "../standing-run";

const order = (ref: string, site: string, createdAt: string, required = "2026-10-06") =>
  ({
    id: ref,
    order_ref: ref,
    customer_name: "Acme",
    site_id: site,
    site_name: site.toUpperCase(),
    required_date: required,
    created_at: createdAt,
  }) as RunOrderCandidate;

describe("standingRunOrders (spec 6.12)", () => {
  const run = { name: "Tuesday run", cutoff: "10:00", siteIds: ["b", "a"] };

  it("suggests orders for the run's sites received before the cut-off, in site order", () => {
    // 10:00 London on 6 October (BST) is 09:00 UTC.
    const out = standingRunOrders(run, "2026-10-06", [
      order("SO-1", "a", "2026-10-05T15:00:00Z"),
      order("SO-2", "b", "2026-10-06T08:59:00Z"),
      order("SO-3", "a", "2026-10-06T09:01:00Z"),
      order("SO-4", "elsewhere", "2026-10-01T09:00:00Z"),
    ]);
    expect(out.orders.map((o) => o.order_ref)).toEqual(["SO-2", "SO-1"]);
    expect(out.late.map((o) => o.order_ref)).toEqual(["SO-3"]);
    expect(out.orders[0].reason).toMatch(
      /^For B, a regular stop on Tuesday run; received 06\/10\/2026 09:59, before the 10:00 cut-off\./,
    );
    expect(out.late[0].reason).toBe("Received 06/10/2026 10:01, after the 10:00 cut-off.");
  });

  it("uses London time in winter too", () => {
    // GMT in December: 10:00 London is 10:00 UTC.
    const out = standingRunOrders(run, "2026-12-08", [order("SO-5", "a", "2026-12-08T09:30:00Z")]);
    expect(out.orders).toHaveLength(1);
  });
});
