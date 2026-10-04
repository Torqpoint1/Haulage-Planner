"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthHeading, FormError } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/auth/errors";
import { fieldErrors, forgotPasswordSchema, type FieldErrors } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/client";

/**
 * Asks Supabase Auth to email a reset link (sent through Resend's SMTP in
 * production). From the browser, so rate limits apply per visitor, and the
 * reply is the same whether or not the account exists.
 */
export function ForgotPasswordForm({ defaultEmail }: { defaultEmail: string }) {
  const [errors, setErrors] = useState<FieldErrors<{ email: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({
      email: new FormData(e.currentTarget).get("email"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    const { error } = await createClient().auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setPending(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    setSentTo(parsed.data.email);
  }

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter your email and we'll send you a link to choose a new password."
      />
      {sentTo ? (
        <div role="status" className="flex flex-col gap-4 text-sm">
          <p>
            If there&rsquo;s an account for <span className="font-medium">{sentTo}</span>,
            we&rsquo;ve emailed it a link to reset the password. The link works once, for an hour.
          </p>
          <p className="text-text-muted">
            Nothing arrived after a few minutes? Check your spam folder, or try again.
          </p>
          <Button onClick={() => setSentTo(null)}>Try again</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormError>{formError}</FormError>
          <Field label="Email" error={errors.email}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={defaultEmail}
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={pending}
            className="mt-2 w-full"
          >
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-text-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-accent-text underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
