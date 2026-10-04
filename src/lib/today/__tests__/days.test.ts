import { describe, expect, it } from "vitest";
import { addWorkingDays } from "../days";

describe("addWorkingDays", () => {
  it("skips weekends", () => {
    expect(addWorkingDays("2026-10-01", 5)).toBe("2026-10-08"); // Thu → next Thu
    expect(addWorkingDays("2026-10-03", 1)).toBe("2026-10-05"); // Sat → Mon
    expect(addWorkingDays("2026-10-05", 0)).toBe("2026-10-05");
  });
});
