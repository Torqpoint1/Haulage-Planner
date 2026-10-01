import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/auth/errors";
import { inviteSchema, signUpSchema, fieldErrors } from "@/lib/auth/schemas";

describe("friendlyError", () => {
  it("explains common sign-in problems", () => {
    expect(friendlyError({ code: "invalid_credentials" })).toMatch(/don't match/);
    expect(friendlyError({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("explains database rules by hint", () => {
    expect(friendlyError({ hint: "last_admin", message: "x" })).toMatch(/at least one admin/);
  });

  it("never shows raw technical messages", () => {
    expect(friendlyError({ message: 'relation "x" does not exist' })).toBe(
      "Something went wrong. Try again.",
    );
  });
});

describe("schemas", () => {
  it("normalises emails and checks passwords", () => {
    const ok = signUpSchema.safeParse({
      fullName: " Sam Patel ",
      email: " Sam@Example.COM ",
      password: "long-enough-pw",
    });
    expect(ok.success && ok.data).toEqual({
      fullName: "Sam Patel",
      email: "sam@example.com",
      password: "long-enough-pw",
    });
    const bad = signUpSchema.safeParse({ fullName: "S", email: "nope", password: "short" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(fieldErrors(bad.error)).toEqual({
        fullName: "Enter your name.",
        email: "Enter a valid email address.",
        password: "Use at least 10 characters.",
      });
    }
  });

  it("only accepts known roles for invitations", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "office" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
  });
});
