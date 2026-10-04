import { describe, expect, it } from "vitest";
import { buildReport, type ReportLoad } from "../compute";

const load = (over: Partial<ReportLoad>): ReportLoad => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-09-10",
  kind: "own",
  name: "Luton 1",
  cost: 100,
  costSource: "running costs",
  drops: 2,
  fill: 0.5,
  failed: [],
  ...over,
});

describe("buildReport", () => {
  const loads = [
    load({ name: "Luton 1", cost: 120, drops: 3, fill: 0.6 }),
    load({ name: "Luton 1", cost: 80, drops: 1, fill: 0.9 }),
    load({ name: "18t curtainsider", cost: 300.5, drops: 5, fill: 0.4 }),
    load({
      kind: "haulier",
      name: "Cotswold Haulage",
      cost: 180,
      costSource: "agreed",
      drops: 2,
      fill: null,
    }),
    load({
      kind: "haulier",
      name: "Cotswold Haulage",
      date: "2026-10-02",
      cost: 95.25,
      costSource: "rate card",
      drops: 1,
      fill: null,
    }),
    load({
      kind: "haulier",
      name: "Severn Pallet Network",
      cost: null,
      costSource: null,
      drops: 1,
      fill: null,
      failed: [{ reason: "no_access", siteName: "Newport depot", orderRefs: ["SO-1"] }],
    }),
  ];
  loads[0].failed = [
    { reason: "site_closed", siteName: "Stroud yard", orderRefs: ["SO-2"] },
    { reason: "no_access", siteName: "Plot 14", orderRefs: ["SO-3", "SO-4"] },
  ];
  const r = buildReport(loads);

  it("works out cost per drop by vehicle and haulier, own vehicles first", () => {
    expect(r.costPerDrop.rows.map((x) => [x.name, x.loads, x.drops, x.cost, x.perDrop])).toEqual([
      ["18t curtainsider", 1, 5, 300.5, 60.1],
      ["Luton 1", 2, 4, 200, 50],
      ["Cotswold Haulage", 2, 3, 275.25, 91.75],
      ["Severn Pallet Network", 1, 1, 0, null],
    ]);
    // Agreed and rate card mixed: an estimate. No price at all: counted as unpriced.
    expect(r.costPerDrop.rows[2].estimate).toBe(true);
    expect(r.costPerDrop.rows[3].unpriced).toBe(1);
    // The total leaves the unpriced load's drop out of the average.
    expect(r.costPerDrop.total).toMatchObject({ loads: 6, drops: 13, cost: 775.75, unpriced: 1 });
    expect(r.costPerDrop.total.perDrop).toBe(64.65);
  });

  it("averages fill per own vehicle", () => {
    expect(r.fill).toEqual([
      { name: "18t curtainsider", loads: 1, average: 0.4, lowest: 0.4, highest: 0.4 },
      { name: "Luton 1", loads: 2, average: 0.75, lowest: 0.6, highest: 0.9 },
    ]);
  });

  it("counts failed deliveries by reason, most common first", () => {
    expect(r.failed.count).toBe(3);
    expect(r.failed.drops).toBe(13);
    expect(r.failed.rate).toBeCloseTo(3 / 13);
    expect(r.failed.byReason).toEqual([
      { reason: "no_access", label: "Couldn't get access", count: 2 },
      { reason: "site_closed", label: "Site closed", count: 1 },
    ]);
  });

  it("adds up haulier spend by month, splitting agreed from estimated", () => {
    expect(r.spend.rows).toEqual([
      {
        month: "2026-09",
        haulier: "Cotswold Haulage",
        loads: 1,
        agreed: 180,
        estimated: 0,
        total: 180,
        unpriced: 0,
      },
      {
        month: "2026-09",
        haulier: "Severn Pallet Network",
        loads: 1,
        agreed: 0,
        estimated: 0,
        total: 0,
        unpriced: 1,
      },
      {
        month: "2026-10",
        haulier: "Cotswold Haulage",
        loads: 1,
        agreed: 0,
        estimated: 95.25,
        total: 95.25,
        unpriced: 0,
      },
    ]);
    expect(r.spend.months).toEqual([
      { month: "2026-09", total: 180 },
      { month: "2026-10", total: 95.25 },
    ]);
    expect(r.spend.total).toBe(275.25);
  });

  it("is empty with no loads", () => {
    const e = buildReport([]);
    expect(e.costPerDrop.total.perDrop).toBeNull();
    expect(e.failed.rate).toBe(0);
    expect(e.spend.total).toBe(0);
  });
});
