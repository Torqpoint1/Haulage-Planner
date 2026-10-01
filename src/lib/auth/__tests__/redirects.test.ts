import { describe, expect, it } from "vitest";
import { isPublicPath, safeNext } from "@/lib/auth/redirects";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/plan?week=2")).toBe("/plan?week=2");
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(bad as string)).toBe("/");
    }
  });
});

describe("isPublicPath", () => {
  it("allows the auth pages and invitations", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/invite/123")).toBe(true);
  });

  it("protects everything else", () => {
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/settings/users")).toBe(false);
    expect(isPublicPath("/sign-inside")).toBe(false);
  });
});
