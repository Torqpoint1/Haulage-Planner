import { describe, expect, it } from "vitest";
import { summariseHours } from "@/lib/settings/hours";

const day = { open: "07:00", close: "17:00" };

describe("summariseHours", () => {
  it("groups consecutive days with the same hours", () => {
    expect(
      summariseHours({
        mon: day,
        tue: day,
        wed: day,
        thu: day,
        fri: day,
        sat: { open: "08:00", close: "12:00" },
      }),
    ).toBe("Mon–Fri 07:00–17:00; Sat 08:00–12:00");
  });

  it("lists pairs and gaps separately", () => {
    expect(summariseHours({ mon: day, tue: day, thu: day })).toBe(
      "Mon, Tue 07:00–17:00; Thu 07:00–17:00",
    );
  });

  it("says when nothing is set", () => {
    expect(summariseHours({})).toBe("No opening hours set");
  });
});
