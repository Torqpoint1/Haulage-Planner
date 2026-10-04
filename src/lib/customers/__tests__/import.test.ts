import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { suggestFieldMapping } from "@/lib/import/mapping";
import { CUSTOMER_IMPORT_FIELDS, planCustomerImport } from "../import";

const lookups = {
  customers: [{ id: "c1", name: "Hillside Builders", account_ref: "HB001" }],
  sites: [{ customer_id: "c1", name: "Stroud yard", postcode: "GL5 3QF" }],
};
const plan = (csv: string) => {
  const table = parseCsv(csv);
  return planCustomerImport(
    table,
    suggestFieldMapping(CUSTOMER_IMPORT_FIELDS, table.headers),
    lookups,
  );
};

describe("planCustomerImport", () => {
  it("groups sites under one customer and adds new sites to existing customers", () => {
    const p = plan(
      [
        "Company,Account,Site,Postcode,Contact,Phone,Forklift",
        "Marlow Joinery,MJ014,Workshop,gl12bb,Tom Marlow,07700 900321,yes",
        "Marlow Joinery,MJ014,Store,GL1 3CC,,,no",
        "Anyone,HB001,Cirencester,GL7 1AA,,,",
      ].join("\n"),
    );
    expect(p.rejected).toEqual([]);
    expect(p.newCustomers).toBe(1);
    expect(p.siteCount).toBe(3);
    const marlow = p.customers.find((c) => c.name === "Marlow Joinery")!;
    expect(marlow.existingId).toBeNull();
    expect(marlow.sites.map((s) => [s.name, s.postcode, s.site_equipment])).toEqual([
      ["Workshop", "GL1 2BB", ["forklift"]],
      ["Store", "GL1 3CC", []],
    ]);
    expect(marlow.sites[0].contact).toEqual({
      name: "Tom Marlow",
      phone: "07700 900321",
      email: "",
    });
    // Matched by account ref, so the existing customer keeps its name.
    expect(p.customers.find((c) => c.existingId === "c1")!.name).toBe("Hillside Builders");
  });

  it("explains each problem against the spreadsheet row", () => {
    const p = plan(
      [
        "Customer,Account ref,Site name,Postcode,Contact phone,Contact email,Booking required",
        ",,,GL1 2BB,,,",
        "Acme,,,not a postcode,,,",
        "Acme,,,GL1 2BB,0800 CALL ME,bad@,maybe",
        "Hillside Builders,HB001,Stroud yard,GL5 3QF,,,",
        "Beta,B1,,GL2 2AA,,,",
        "Gamma,B1,,GL2 2AB,,,",
      ].join("\n"),
    );
    expect(p.rejected.map((r) => [r.row, r.errors])).toEqual([
      [2, ["Enter the customer's name."]],
      [3, ["“not a postcode” isn't a UK postcode."]],
      [
        4,
        [
          "“0800 CALL ME” isn't a phone number (digits, spaces and + ( ) - only).",
          "“bad@” isn't an email address.",
          "Add the contact's name for that phone or email.",
          "Booking required should be yes or no, not “maybe”.",
        ],
      ],
      [5, ["Hillside Builders already has Stroud yard at GL5 3QF."]],
      [7, ["Account ref B1 is used for both “Beta” and “Gamma”."]],
    ]);
  });
});
