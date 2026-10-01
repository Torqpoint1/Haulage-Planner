"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthHeading, FormError } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/auth/errors";
import { PASSWORD_MIN, fieldErrors, signUpSchema, type FieldErrors } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/client";

type Values = { fullName: string; email: string; password: string };

export function SignUpForm({ next, defaultEmail }: { next: string; defaultEmail: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: form.get("fullName"),
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
    const { data, error } = await createClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setFormError(friendlyError(error));
      setPending(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is switched on for this project.
      setCheckEmail(parsed.data.email);
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (checkEmail) {
    return (
      <EmptyState
        compact
        icon={MailCheck}
        title="Check your email"
        description={`We've sent a link to ${checkEmail}. Open it to confirm your address and carry on.`}
      />
    );
  }

  const signInHref =
    next !== "/onboarding" ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  return (
    <>
      <AuthHeading
        title="Create an account"
        description="Set up your company in a couple of minutes."
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{formError}</FormError>
        <Field label="Your name" error={errors.fullName}>
          <Input name="fullName" autoComplete="name" required />
        </Field>
        <Field label="Work email" error={errors.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail}
            required
          />
        </Field>
        <Field
          label="Password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errors.password}
        >
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link
          href={signInHref}
          className="font-medium text-accent-text underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
