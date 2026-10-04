/**
 * Sending email (spec 4: Resend), behind a small module so the provider can
 * be swapped. Never throws: without RESEND_API_KEY, or if Resend is down,
 * callers get `{ sent: false }` and fall back (e.g. show a link to copy).
 */

export type Email = { to: string; subject: string; text: string; html?: string };
export type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

type Fetch = typeof fetch;

const TIMEOUT_MS = 5000;

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(email: Email, fetchImpl: Fetch = fetch): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "not_configured" };
  try {
    const base = process.env.RESEND_API_URL ?? "https://api.resend.com";
    const response = await fetchImpl(`${base}/emails`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });
    if (!response.ok) {
      console.error("Resend refused the email", response.status, await response.text());
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (error) {
    console.error("Resend unreachable", error);
    return { sent: false, reason: "failed" };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A plain, accessible email: a few paragraphs and one button. */
export function simpleEmail(opts: {
  paragraphs: string[];
  action: { label: string; url: string };
  footer?: string;
}): { text: string; html: string } {
  const text = [...opts.paragraphs, `${opts.action.label}: ${opts.action.url}`, opts.footer]
    .filter(Boolean)
    .join("\n\n");
  const p = (s: string) =>
    `<p style="margin:0 0 16px;font:16px/1.5 system-ui,sans-serif;color:#1f2937">${escape(s)}</p>`;
  const html = [
    '<div style="max-width:560px;margin:0 auto;padding:24px">',
    ...opts.paragraphs.map(p),
    `<p style="margin:24px 0"><a href="${escape(opts.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;font:600 16px system-ui,sans-serif;text-decoration:none">${escape(opts.action.label)}</a></p>`,
    p(`Or copy this link: ${opts.action.url}`),
    opts.footer
      ? `<p style="margin:24px 0 0;font:13px/1.5 system-ui,sans-serif;color:#6b7280">${escape(opts.footer)}</p>`
      : "",
    "</div>",
  ].join("");
  return { text, html };
}
