import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, simpleEmail } from "@/lib/services/email";

const email = { to: "sam@example.test", subject: "Hello", text: "Hi" };

describe("sendEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchImpl = vi.fn();
    expect(await sendEmail(email, fetchImpl)).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to Resend with the key and sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Planner <noreply@example.test>");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendEmail(email, fetchImpl)).toEqual({ sent: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Planner <noreply@example.test>",
      to: ["sam@example.test"],
      subject: "Hello",
    });
  });

  it("never throws when Resend fails or is unreachable", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = vi.fn(async () => new Response("bad", { status: 422 }));
    expect(await sendEmail(email, refused)).toEqual({ sent: false, reason: "failed" });
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await sendEmail(email, down)).toEqual({ sent: false, reason: "failed" });
  });
});

describe("simpleEmail", () => {
  it("escapes text in the HTML and keeps the link in the plain text", () => {
    const { text, html } = simpleEmail({
      paragraphs: ["Join <Example> & Co"],
      action: { label: "Accept", url: "https://app.example/invite/abc" },
    });
    expect(html).toContain("Join &#60;Example&#62; &#38; Co");
    expect(text).toContain("Accept: https://app.example/invite/abc");
  });
});
