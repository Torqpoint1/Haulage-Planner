"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthHeading, FormError } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/auth/errors";
import {
  PASSWORD_MIN,
  fieldErrors,
  resetPasswordSchema,
  type FieldErrors,
} from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors<{ password: string; confirm: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password: parsed.data.password });
    if (error) {
      setFormError(friendlyError(error));
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description={
          <>
            For <span className="font-medium">{email}</span>.
          </>
        }
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{formError}</FormError>
        <Field
          label="New password"
          hint={`At least ${PASSWORD_MIN} characters.`}
          error={errors.password}
        >
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Type it again" error={errors.confirm}>
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
          Save password and sign in
        </Button>
      </form>
    </>
  );
}
