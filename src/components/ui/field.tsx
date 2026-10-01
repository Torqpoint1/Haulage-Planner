"use client";

import { Label as LabelPrimitive } from "radix-ui";
import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/cn";

type FieldContextValue = {
  id: string;
  hintId: string;
  errorId: string;
  invalid: boolean;
  hasHint: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/** Gives a control inside <Field> its id and aria wiring automatically. */
export function useFieldControl(props: { id?: string; "aria-describedby"?: string }) {
  const field = useContext(FieldContext);
  if (!field) return { id: props.id, "aria-describedby": props["aria-describedby"] };
  const describedBy = [
    props["aria-describedby"],
    field.hasHint ? field.hintId : null,
    field.invalid ? field.errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: props.id ?? field.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": field.invalid || undefined,
  };
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-sm font-medium text-text select-none", className)}
      {...props}
    />
  );
}

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Set when the label is shown elsewhere (e.g. a table header). */
  hideLabel?: boolean;
  className?: string;
  id?: string;
  children: React.ReactNode;
};

/**
 * Label + control + hint/error, laid out on a shared vertical rhythm so that
 * forms line up across screens (spec 10.2).
 */
export function Field({
  label,
  hint,
  error,
  required,
  hideLabel,
  className,
  id,
  children,
}: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? `field-${autoId}`;
  const value: FieldContextValue = {
    id: fieldId,
    hintId: `${fieldId}-hint`,
    errorId: `${fieldId}-error`,
    invalid: Boolean(error),
    hasHint: Boolean(hint),
  };
  return (
    <FieldContext value={value}>
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        <Label htmlFor={fieldId} className={hideLabel ? "sr-only" : undefined}>
          {label}
          {required ? (
            <span className="text-text-subtle font-normal">
              {" "}
              <span aria-hidden>*</span>
              <span className="sr-only">(required)</span>
            </span>
          ) : null}
        </Label>
        {children}
        {hint && !error ? (
          <p id={value.hintId} className="text-sm text-text-subtle">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={value.errorId} className="text-sm text-danger-fg" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}
