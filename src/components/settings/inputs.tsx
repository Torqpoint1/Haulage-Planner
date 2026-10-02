"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { COLOUR_TAGS } from "@/lib/settings/options";
import { useFormErrors } from "./entity-form";

type Option = { value: string; label: string };

/** A labelled group of checkboxes that submit under one name. */
export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  defaultValue = [],
  columns = 2,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: readonly Option[];
  defaultValue?: readonly string[];
  columns?: 1 | 2 | 3;
}) {
  const { errors } = useFormErrors();
  const id = useId();
  const error = errors[name];
  return (
    <fieldset
      className="min-w-0"
      aria-describedby={
        [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].join(" ").trim() || undefined
      }
    >
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mb-2 text-sm text-text-subtle">
          {hint}
        </p>
      ) : null}
      <div
        className={cn(
          "grid gap-x-4 gap-y-2",
          columns === 2 && "md:grid-cols-2",
          columns === 3 && "grid-cols-2 md:grid-cols-3",
        )}
      >
        {options.map((o) => (
          <Checkbox
            key={o.value}
            name={name}
            value={o.value}
            label={o.label}
            defaultChecked={defaultValue.includes(o.value)}
          />
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Pick one of the fixed tag colours (spec 6.2: "colour tag from a fixed palette"). */
export function ColourPicker({
  name,
  legend = "Colour",
  defaultValue = "load-1",
}: {
  name: string;
  legend?: string;
  defaultValue?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <RadioGroupPrimitive.Root
        name={name}
        defaultValue={defaultValue}
        className="flex flex-wrap gap-2"
        aria-label={legend}
      >
        {COLOUR_TAGS.map((c) => (
          <RadioGroupPrimitive.Item
            key={c.value}
            value={c.value}
            aria-label={c.label}
            title={c.label}
            className={cn(
              "flex size-control-sm items-center justify-center rounded-full border-2 border-transparent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "data-[state=checked]:border-text",
            )}
          >
            <span className={cn("size-6 rounded-full", `map-dot-${c.value}`)} aria-hidden />
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}

/** A coloured dot for lists, with the colour's name for screen readers. */
export function ColourDot({ tag, className }: { tag: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full", `map-dot-${tag}`, className)}
      aria-hidden
    />
  );
}
