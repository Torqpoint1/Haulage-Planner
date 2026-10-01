/**
 * Turn Supabase and database errors into plain English (spec 10.6).
 * Unknown errors get a generic message; details go to the server log.
 */

type MaybeError =
  { code?: string; status?: number; message?: string; hint?: string } | null | undefined;

const AUTH: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: "Confirm your email address first. Check your inbox for the link.",
  user_already_exists: "There's already an account with that email. Sign in instead.",
  email_exists: "There's already an account with that email. Sign in instead.",
  weak_password: "Choose a stronger password: longer, and not a common word.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  signup_disabled: "New sign-ups are turned off. Ask your administrator for an invitation.",
  email_address_invalid: "Enter a valid email address.",
};

const DATABASE_HINTS: Record<string, string> = {
  already_member: "That person already belongs to an organisation.",
  last_admin: "Every organisation needs at least one admin. Make someone else an admin first.",
  invalid: "This invitation is no longer valid. Ask for a new one.",
  used: "This invitation has already been used.",
  expired: "This invitation has expired. Ask for a new one.",
  wrong_email: "This invitation was sent to a different email address.",
};

export function friendlyError(
  error: MaybeError,
  fallback = "Something went wrong. Try again.",
): string {
  if (!error) return fallback;
  if (error.code && AUTH[error.code]) return AUTH[error.code];
  if (error.status === 429) return AUTH.over_request_rate_limit;
  if (error.hint && DATABASE_HINTS[error.hint]) return DATABASE_HINTS[error.hint];
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.message === "Failed to fetch" || error.message?.includes("fetch failed")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return fallback;
}
