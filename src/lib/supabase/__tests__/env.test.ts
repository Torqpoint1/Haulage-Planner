import { describe, expect, it } from "vitest";
import { clean } from "../env";

describe("clean", () => {
  it("drops line breaks and spaces picked up when pasting", () => {
    expect(clean("https://abc.supa\nbase.co\n")).toBe("https://abc.supabase.co");
    expect(clean(" sb_publishable_x \r\n")).toBe("sb_publishable_x");
    expect(clean(undefined)).toBe("");
  });
});
