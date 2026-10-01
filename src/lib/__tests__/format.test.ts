import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateLong,
  formatDayShort,
  formatDateTime,
  formatGbp,
  formatKg,
  formatLocalDate,
  formatMiles,
  formatMm,
  formatPercent,
  formatTime,
  formatLocalDayShort,
  fromIsoDate,
  londonToday,
  parseUkDate,
  plural,
} from "@/lib/format";

describe("dates and times", () => {
  // 14:05 UTC on 1 Oct 2026 is 15:05 BST in London
  const summer = new Date("2026-10-01T14:05:00Z");
  // 23:30 UTC on 15 Jan 2026 is 23:30 GMT
  const winter = new Date("2026-01-15T23:30:00Z");

  it("formats dd/mm/yyyy in Europe/London", () => {
    expect(formatDate(summer)).toBe("01/10/2026");
    expect(formatDate(new Date("2026-06-30T23:30:00Z"))).toBe("01/07/2026");
  });

  it("formats 24-hour times with daylight saving", () => {
    expect(formatTime(summer)).toBe("15:05");
    expect(formatTime(winter)).toBe("23:30");
    expect(formatTime(new Date("2026-03-01T00:05:00Z"))).toBe("00:05");
  });

  it("formats day names identically in every runtime", () => {
    expect(formatDayShort(summer)).toBe("Thu 1 Oct");
    expect(formatDateLong(summer)).toBe("Thursday 1 October 2026");
    expect(formatDayShort(new Date("2026-09-28T09:00:00Z"))).toBe("Mon 28 Sep");
    // 23:30 UTC on 30 Sep is already Thursday 1 Oct in London
    expect(formatDayShort(new Date("2026-09-30T23:30:00Z"))).toBe("Thu 1 Oct");
  });

  it("formats date and time together", () => {
    expect(formatDateTime(summer)).toBe("01/10/2026 15:05");
  });

  it("parses typed UK dates", () => {
    expect(formatLocalDate(parseUkDate("1/10/2026")!)).toBe("01/10/2026");
    expect(formatLocalDate(parseUkDate("01.10.26")!)).toBe("01/10/2026");
    expect(parseUkDate("31/02/2026")).toBeNull();
    expect(parseUkDate("2026-10-01")).toBeNull();
    expect(parseUkDate("")).toBeNull();
  });
});

describe("units and money", () => {
  it("formats weights and lengths", () => {
    expect(formatKg(1250)).toBe("1,250 kg");
    expect(formatMm(2400)).toBe("2,400 mm");
  });

  it("formats miles with sensible precision", () => {
    expect(formatMiles(31.4)).toBe("31 miles");
    expect(formatMiles(4.25)).toBe("4.3 miles");
    expect(formatMiles(1)).toBe("1 mile");
  });

  it("formats pounds", () => {
    expect(formatGbp(1234.5)).toBe("£1,234.50");
    expect(formatGbp(1234.5, { whole: true })).toBe("£1,235");
  });

  it("formats percentages and plurals", () => {
    expect(formatPercent(0.875)).toBe("88%");
    expect(plural(1, "drop")).toBe("1 drop");
    expect(plural(5, "drop")).toBe("5 drops");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});

describe("calendar dates", () => {
  it("finds today's date in London regardless of runtime timezone", () => {
    // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in London (BST)
    expect(londonToday(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
    // 23:30 UTC on 15 Jan is still 15 Jan in London (GMT)
    expect(londonToday(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
  });

  it("round-trips ISO calendar dates", () => {
    const d = fromIsoDate("2026-10-01");
    expect(formatLocalDate(d)).toBe("01/10/2026");
    expect(formatLocalDayShort(d)).toBe("Thu 1 Oct");
  });
});
