import { expect } from "@playwright/test";

/** Emails the app sent through (mock) Resend to an address, oldest first. */
export async function sentEmails(
  to: string,
): Promise<{ subject: string; text: string; html: string; to: string[] }[]> {
  let emails: { subject: string; text: string; html: string; to: string[] }[] = [];
  await expect(async () => {
    const response = await fetch(`http://localhost:3197/emails?to=${encodeURIComponent(to)}`);
    emails = await response.json();
    expect(emails.length).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
  return emails;
}

/** Local Supabase Auth's mail catcher (Mailpit). */
const MAILPIT = "http://localhost:54324/api/v1";

/** The text of the newest auth email (e.g. a password reset) sent to an address. */
export async function latestAuthEmail(to: string): Promise<string> {
  let id = "";
  await expect(async () => {
    const response = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await response.json()) as { messages: { ID: string }[] };
    expect(body.messages.length).toBeGreaterThan(0);
    id = body.messages[0].ID;
  }).toPass({ timeout: 15_000 });
  const message = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
  return message.Text;
}
