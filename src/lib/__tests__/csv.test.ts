import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads headers and rows", () => {
    expect(parseCsv("a,b\n1,2\n3,4\n")).toEqual({
      headers: ["a", "b"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });

  it("handles quotes, embedded commas, doubled quotes and line breaks", () => {
    const { rows } = parseCsv('name,notes\r\n"Smith, J","Said ""hi""\nthen left"\r\n');
    expect(rows).toEqual([["Smith, J", 'Said "hi"\nthen left']]);
  });

  it("strips Excel's BOM and skips blank lines", () => {
    expect(parseCsv("﻿ref\n\nA1\n  \nA2").rows).toEqual([["A1"], ["A2"]]);
  });

  it("detects semicolon-separated files", () => {
    expect(parseCsv("ref;qty\nA1;3").rows).toEqual([["A1", "3"]]);
  });

  it("pads short rows and trims long ones to the header width", () => {
    expect(parseCsv("a,b,c\n1\n1,2,3,4").rows).toEqual([
      ["1", "", ""],
      ["1", "2", "3"],
    ]);
  });
});

describe("toCsv", () => {
  it("quotes where needed and round-trips", () => {
    const csv = toCsv(["ref", "note"], [["A1", 'has "quotes", commas']]);
    expect(parseCsv(csv).rows).toEqual([["A1", 'has "quotes", commas']]);
  });

  it("neutralises spreadsheet formulas", () => {
    expect(toCsv(["x"], [["=SUM(A1)"]])).toContain("'=SUM(A1)");
  });
});
