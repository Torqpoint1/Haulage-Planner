import { describe, expect, it } from "vitest";
import {
  dateRange,
  hasFilters,
  monthRange,
  parseFilters,
  recentMonths,
  toSearchParams,
  unitTotals,
} from "../filters";

const ID = "7b0f5f8e-7d1f-4f0b-9c1e-3f3f3f3f3f3f";

describe("history filters", () => {
  it("reads only valid values from the URL", () => {
    const f = parseFilters({
      q: "  PO-77 ",
      customer: ID,
      site: "nope",
      month: "2026-13",
      from: "2026-10-01",
    });
    expect(f).toMatchObject({
      q: "PO-77",
      customer: ID,
      site: null,
      month: null,
      from: "2026-10-01",
    });
    expect(hasFilters(f)).toBe(true);
    expect(hasFilters(parseFilters({}))).toBe(false);
  });

  it("turns a month into its first and last day, leap years included", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(dateRange(parseFilters({ month: "2026-09", from: "2026-01-01" }))).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(dateRange(parseFilters({ from: "2026-10-31", to: "2026-10-01" }))).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("round-trips through the URL", () => {
    const f = parseFilters({ q: "Hillside", customer: ID, month: "2026-10" });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(toSearchParams(f))))).toEqual(f);
  });

  it("lists recent months newest first, in British English", () => {
    expect(recentMonths("2026-01-15", 3)).toEqual([
      { value: "2026-01", label: "January 2026" },
      { value: "2025-12", label: "December 2025" },
      { value: "2025-11", label: "November 2025" },
    ]);
  });

  it("adds up units by type", () => {
    expect(
      unitTotals([
        { unit: "Door pack", quantity: 2 },
        { unit: "Euro pallet", quantity: 6 },
        { unit: "Door pack", quantity: 3 },
      ]),
    ).toEqual([
      { unit: "Euro pallet", quantity: 6 },
      { unit: "Door pack", quantity: 5 },
    ]);
  });
});
