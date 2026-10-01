"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-heading";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createOrganisation, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    createOrganisation,
    {},
  );
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormError>{state.formError}</FormError>
      <Field
        label="Company name"
        hint="As your team and customers know it."
        error={state.fieldErrors?.name}
      >
        <Input name="name" autoComplete="organization" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        Create company
      </Button>
    </form>
  );
}
