"use client";

import { FormField, FormSection } from "@/components/settings/entity-form";
import { Input, Textarea } from "@/components/ui/input";
import type { Customer } from "@/lib/customers/types";

export function CustomerFields({ row }: { row: Customer | null }) {
  return (
    <>
      <FormSection title="Customer">
        <FormField name="name" label="Name" required>
          <Input name="name" defaultValue={row?.name} autoComplete="organization" />
        </FormField>
        <FormField
          name="account_ref"
          label="Account ref"
          hint="Your reference for them, e.g. from your accounts system."
        >
          <Input name="account_ref" defaultValue={row?.account_ref} />
        </FormField>
      </FormSection>
      <FormSection title="Defaults">
        <FormField
          name="default_delivery_instructions"
          label="Default delivery instructions"
          hint="Used for new sites; each site and order can change them."
        >
          <Textarea
            name="default_delivery_instructions"
            defaultValue={row?.default_delivery_instructions}
          />
        </FormField>
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={row?.notes} rows={4} />
        </FormField>
      </FormSection>
    </>
  );
}
