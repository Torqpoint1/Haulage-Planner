"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { FormError } from "@/components/auth/auth-heading";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/settings/result";

type FormContextValue = { errors: Record<string, string>; pending: boolean };
const FormContext = createContext<FormContextValue>({ errors: {}, pending: false });

export function useFormErrors() {
  return useContext(FormContext);
}

type EntityFormProps = {
  id: string;
  action: (formData: FormData) => Promise<FormState>;
  onSaved?: (state: FormState) => void;
  onPendingChange?: (pending: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * A settings form. Submits with a transition rather than a form action so
 * that typed values stay put when validation fails (React resets forms after
 * an action completes).
 */
export function EntityForm({
  id,
  action,
  onSaved,
  onPendingChange,
  children,
  className,
}: EntityFormProps) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onPendingChange?.(true);
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      onPendingChange?.(false);
      if (result.ok) onSaved?.(result);
      else {
        // Move focus to the first problem so keyboard and screen reader users find it.
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(`#${id} [aria-invalid="true"], #${id} [role="alert"]`)
            ?.focus();
        });
      }
    });
  }

  return (
    <FormContext value={{ errors: state.errors ?? {}, pending }}>
      <form id={id} onSubmit={onSubmit} noValidate className={className ?? "flex flex-col gap-6"}>
        {state.error ? (
          <div tabIndex={-1} className="outline-none">
            <FormError>{state.error}</FormError>
          </div>
        ) : state.errors && Object.keys(state.errors).length ? (
          <div tabIndex={-1} className="outline-none">
            <FormError>Check the highlighted fields.</FormError>
          </div>
        ) : null}
        {children}
      </form>
    </FormContext>
  );
}

/** A Field whose error comes from the surrounding EntityForm by name. */
export function FormField({
  name,
  ...props
}: Omit<React.ComponentProps<typeof Field>, "error"> & { name: string }) {
  const { errors } = useFormErrors();
  return <Field {...props} error={errors[name]} />;
}

/** Group heading inside a long form. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full text-sm font-semibold">{title}</legend>
      {description ? <p className="clear-left text-sm text-text-muted">{description}</p> : null}
      <div className="clear-left flex min-w-0 flex-col gap-4 pt-3">{children}</div>
    </fieldset>
  );
}

/** Two columns from tablet up, for short related fields. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-4 md:grid-cols-2">{children}</div>;
}
