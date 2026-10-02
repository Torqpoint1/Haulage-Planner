import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import {
  missingRequired,
  planOrderImport,
  suggestMapping,
  type ImportLookups,
} from "@/lib/orders/import";

const lookups: ImportLookups = {
  customers: [
    { id: "c-hill", name: "Hillside Builders", account_ref: "HB001" },
    { id: "c-sev", name: "Severn Timber", account_ref: "STM07" },
    { id: "c-twin1", name: "Twin Ltd", account_ref: "TW1" },
    { id: "c-twin2", name: "Twin Ltd", account_ref: "TW2" },
    { id: "c-none", name: "No Sites Ltd", account_ref: "" },
  ],
  sites: [
    {
      id: "s-hill",
      customer_id: "c-hill",
      name: "Stroud yard",
      postcode: "GL5 3QF",
      delivery_instructions: "Call ahead",
    },
    { id: "s-sev1", customer_id: "c-sev", name: "Newport depot", postcode: "NP20 4AA" },
    { id: "s-sev2", customer_id: "c-sev", name: "Cardiff branch", postcode: "CF10 1EP" },
  ],
  unitTypes: [
    { id: "u-eur", name: "Euro pallet", short_code: "EUR", typical_weight_kg: 300 },
    { id: "u-dp", name: "Door pack", short_code: "DP", typical_weight_kg: 140 },
  ],
  existingRefs: new Set(["ord-0001"]),
};

const HEADER = "Order No,Customer,Postcode,PO Number,Delivery Date,Unit,Qty,Weight,Description";

function plan(lines: string[], header = HEADER) {
  const table = parseCsv([header, ...lines].join("\n"));
  return planOrderImport(table, suggestMapping(table.headers), lookups);
}

describe("suggestMapping", () => {
  it("recognises common header names", () => {
    expect(suggestMapping(HEADER.split(","))).toEqual({
      order_ref: "Order No",
      customer: "Customer",
      site: "Postcode",
      customer_po: "PO Number",
      required_date: "Delivery Date",
      unit_type: "Unit",
      quantity: "Qty",
      weight_per_unit_kg: "Weight",
      line_description: "Description",
    });
  });

  it("prefers the organisation's remembered mapping", () => {
    expect(
      suggestMapping(["Ref", "Our Ref", "Cust"], { order_ref: "Our Ref", customer: "Cust" }),
    ).toMatchObject({
      order_ref: "Our Ref",
      customer: "Cust",
    });
  });

  it("says which required fields still need a column", () => {
    expect(missingRequired({ order_ref: "A" })).toEqual([
      "Customer",
      "Required date",
      "Unit type",
      "Quantity",
    ]);
  });
});

describe("planOrderImport", () => {
  it("builds orders, grouping rows with the same order ref into lines", () => {
    const result = plan([
      "A-1,HB001,GL5 3QF,PO-9,12/10/2026,DP,6,,Front doors",
      "A-1,HB001,GL5 3QF,PO-9,12/10/2026,EUR,2,250,",
      "A-2,Severn Timber,np204aa,,2026-10-13,eur,1,,",
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.orders).toHaveLength(2);
    expect(result.lineCount).toBe(3);
    expect(result.orders[0]).toMatchObject({
      order: {
        customer_id: "c-hill",
        site_id: "s-hill",
        order_ref: "A-1",
        customer_po: "PO-9",
        required_date: "2026-10-12",
        urgency: "standard",
        readiness: "not_started",
        delivery_instructions: "Call ahead",
      },
      lines: [
        { unit_type_id: "u-dp", quantity: 6, weight_per_unit_kg: 140, description: "Front doors" },
        { unit_type_id: "u-eur", quantity: 2, weight_per_unit_kg: 250, description: "" },
      ],
      rows: [2, 3],
    });
    expect(result.orders[1].order).toMatchObject({
      site_id: "s-sev1",
      required_date: "2026-10-13",
    });
  });

  it("explains every problem in plain English, by spreadsheet row", () => {
    const result = plan([
      ",HB001,GL5 3QF,,12/10/2026,DP,1,,",
      "B-2,Nobody,GL5 3QF,,12/10/2026,DP,1,,",
      "B-3,Twin Ltd,,,12/10/2026,DP,1,,",
      "B-4,STM07,,,12/10/2026,DP,1,,",
      "B-5,STM07,GL5,,12/10/2026,DP,1,,",
      "B-6,STM07,SA1 1AA,,12/10/2026,DP,1,,",
      "B-7,HB001,,,31/02/2026,DP,1,,",
      "B-8,HB001,,,12/10/2026,BOX,1.5,heavy,",
      "ORD-0001,HB001,,,12/10/2026,DP,1,,",
      "B-9,No Sites Ltd,,,12/10/2026,DP,1,,",
    ]);
    const byRow = Object.fromEntries(result.rejected.map((r) => [r.row, r.errors]));
    expect(byRow[2]).toEqual(["Order ref is missing."]);
    expect(byRow[3]).toEqual([
      "No customer called “Nobody”. Check the spelling, or add them on the Customers page first.",
    ]);
    expect(byRow[4]).toEqual([
      "More than one customer is called “Twin Ltd”. Use their account ref instead.",
    ]);
    expect(byRow[5]).toEqual(["Severn Timber has 2 sites. Say which one, by name or postcode."]);
    expect(byRow[6]).toEqual(["“GL5” isn't a full UK postcode."]);
    expect(byRow[7]).toEqual([
      "Severn Timber has no site at SA1 1AA. Add the site first, or check the postcode.",
    ]);
    expect(byRow[8]).toEqual(["Required date “31/02/2026” isn't a valid date. Use dd/mm/yyyy."]);
    expect(byRow[9]).toEqual([
      "No unit type “BOX”. Use a short code such as EUR, DP.",
      "Quantity “1.5” must be a whole number from 1 to 10,000.",
      "Weight “heavy” must be a number of kg.",
    ]);
    expect(byRow[10]).toEqual(["Order ORD-0001 already exists."]);
    expect(byRow[11]).toEqual([
      "No Sites Ltd has no delivery sites yet. Add one on the Customers page first.",
    ]);
    expect(result.orders).toEqual([]);
  });

  it("skips a whole order when one of its rows is wrong, and says why", () => {
    const result = plan([
      "C-1,HB001,,,12/10/2026,DP,2,,",
      "C-1,HB001,,,12/10/2026,XX,1,,",
      "C-2,HB001,,,12/10/2026,DP,1,,",
    ]);
    expect(result.orders.map((o) => o.order.order_ref)).toEqual(["C-2"]);
    expect(result.rejected.map((r) => [r.row, r.errors.at(-1)])).toEqual([
      [2, "Not imported because row 3 of the same order has a problem."],
      [3, "No unit type “XX”. Use a short code such as EUR, DP."],
    ]);
  });

  it("refuses rows of one order that disagree about its details", () => {
    const result = plan(["D-1,HB001,,PO-1,12/10/2026,DP,1,,", "D-1,HB001,,PO-2,12/10/2026,DP,1,,"]);
    expect(result.rejected[1].errors[0]).toBe(
      "Order details differ from row 2 for the same order ref (customer po).",
    );
  });

  it("understands urgency and readiness words", () => {
    const result = plan(
      [
        "E-1,HB001,,12/10/2026,DP,1,urgent,part ready,20/10/2026,2 frames",
        "E-2,HB001,,12/10/2026,DP,1,T,yes,,",
      ],
      "Order No,Customer,Site,Delivery Date,Unit,Qty,Priority,Readiness,Ready date,Missing",
    );
    expect(
      result.orders.map((o) => [
        o.order.urgency,
        o.order.readiness,
        o.order.expected_ready_date,
        o.order.missing_items,
      ]),
    ).toEqual([
      ["critical", "part_ready", "2026-10-20", "2 frames"],
      ["timed", "ready", null, ""],
    ]);
  });

  it("handles a 200-row file with a mix of good and bad rows", () => {
    const rows = Array.from({ length: 200 }, (_, i) => {
      const bad = i % 25 === 7; // 8 bad rows
      return `F-${String(Math.floor(i / 2)).padStart(3, "0")},HB001,GL5 3QF,,${bad ? "32/10/2026" : "12/10/2026"},${i % 2 ? "EUR" : "DP"},${(i % 5) + 1},,`;
    });
    const result = plan(rows);
    expect(result.rows).toHaveLength(200);
    // Each bad row also takes its partner row (same order ref) with it.
    expect(result.rejected).toHaveLength(16);
    expect(result.orders).toHaveLength(92);
    expect(result.lineCount).toBe(184);
  });
});
