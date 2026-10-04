"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthHeading, FormError } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/auth/errors";
import { fieldErrors, signInSchema, type FieldErrors } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/client";

type Values = { email: string; password: string };

/**
 * Signs in from the browser so Supabase's per-IP rate limits apply to each
 * visitor rather than to our server (spec 12: rate limiting on auth).
 */
export function SignInForm({
  next,
  defaultEmail,
  linkFailed = false,
}: {
  next: string;
  defaultEmail: string;
  /** Arrived from an emailed link that had expired or was already used. */
  linkFailed?: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | null>(
    linkFailed
      ? "That link has expired or has already been used. Sign in, or ask for a new reset link."
      : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    const { error } = await createClient().auth.signInWithPassword(parsed.data);
    if (error) {
      setFormError(friendlyError(error));
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const signUpHref = next !== "/" ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";

  return (
    <>
      <AuthHeading
        title="Sign in"
        description="Welcome back. Sign in to plan today's deliveries."
      />
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
        <Field label="Password" error={errors.password}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Link
          href="/forgot-password"
          className="w-fit text-sm font-medium text-accent-text underline underline-offset-2"
        >
          Forgot your password?
        </Link>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        New here?{" "}
        <Link
          href={signUpHref}
          className="font-medium text-accent-text underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
