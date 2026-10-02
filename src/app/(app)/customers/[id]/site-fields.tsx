"use client";

import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { CheckboxGroup, WeeklyHoursFields } from "@/components/settings/inputs";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { SITE_EQUIPMENT } from "@/lib/customers/options";
import type { Site } from "@/lib/customers/types";
import { VEHICLE_TYPES } from "@/lib/settings/options";

/** Every site restriction from spec 6.6, grouped the way a planner thinks about them. */
export function SiteFields({
  row,
  customerId,
  defaultInstructions,
}: {
  row: Site | null;
  customerId: string;
  defaultInstructions: string;
}) {
  const s = row;
  return (
    <>
      <FormSection title="Address">
        <input type="hidden" name="customer_id" value={customerId} />
        <FormField
          name="name"
          label="Site name"
          required
          hint="How your team refers to it, e.g. “Plot 14” or “Gloucester branch”."
        >
          <Input name="name" defaultValue={s?.name} />
        </FormField>
        <FormField name="address" label="Address">
          <Textarea name="address" defaultValue={s?.address} rows={3} />
        </FormField>
        <FieldRow>
          <FormField
            name="postcode"
            label="Postcode"
            required
            hint="Places the pin on the map. You can move it afterwards."
          >
            <Input
              name="postcode"
              defaultValue={s?.postcode}
              autoComplete="postal-code"
              className="uppercase"
            />
          </FormField>
        </FieldRow>
      </FormSection>

      <FormSection title="Access" description="Leave blank if there's no limit.">
        <FieldRow>
          <FormField name="max_vehicle_type" label="Largest vehicle allowed">
            <Select
              name="max_vehicle_type"
              options={[{ value: "none", label: "No limit" }, ...VEHICLE_TYPES]}
              defaultValue={s?.max_vehicle_type ?? "none"}
            />
          </FormField>
          <FormField name="max_length_m" label="Maximum vehicle length">
            <Input
              name="max_length_m"
              inputMode="decimal"
              defaultValue={s?.max_length_m ?? ""}
              trailing="m"
              className="num"
            />
          </FormField>
          <FormField name="max_weight_kg" label="Maximum vehicle weight">
            <Input
              name="max_weight_kg"
              inputMode="numeric"
              defaultValue={s?.max_weight_kg ?? ""}
              trailing="kg"
              className="num"
            />
          </FormField>
          <FormField name="height_limit_m" label="Height restriction">
            <Input
              name="height_limit_m"
              inputMode="decimal"
              defaultValue={s?.height_limit_m ?? ""}
              trailing="m"
              className="num"
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="no_hgvs"
          label="No HGVs"
          description="Vans and Lutons only."
          defaultChecked={s?.no_hgvs ?? false}
        />
        <FormField name="narrow_access_note" label="Narrow access">
          <Input
            name="narrow_access_note"
            defaultValue={s?.narrow_access_note}
            placeholder="e.g. Tight turn at the gate; no artics"
          />
        </FormField>
        <FormField name="parking_note" label="Parking">
          <Input
            name="parking_note"
            defaultValue={s?.parking_note}
            placeholder="e.g. Unload on the street; no parking 8–9am"
          />
        </FormField>
      </FormSection>

      <FormSection title="Unloading at the site">
        <CheckboxGroup
          name="site_equipment"
          legend="Equipment on site"
          hint="Leave all unticked if they have nothing."
          options={SITE_EQUIPMENT}
          defaultValue={s?.site_equipment ?? []}
          columns={1}
        />
        <Toggle
          name="handball_allowed"
          label="Handballing allowed"
          description="Goods can be carried off by hand."
          defaultChecked={s?.handball_allowed ?? false}
        />
        <FieldRow>
          <FormField name="handball_people" label="People needed to handball">
            <Input
              name="handball_people"
              inputMode="numeric"
              defaultValue={s?.handball_people ?? ""}
              className="num"
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="crane_drop_allowed"
          label="Crane drop allowed"
          defaultChecked={s?.crane_drop_allowed ?? false}
        />
      </FormSection>

      <FormSection title="Booking">
        <Toggle
          name="booking_required"
          label="Booking required"
          description="Deliveries need a booking reference and slot."
          defaultChecked={s?.booking_required ?? false}
        />
        <FieldRow>
          <FormField name="booking_lead_hours" label="Notice needed">
            <Input
              name="booking_lead_hours"
              inputMode="numeric"
              defaultValue={s?.booking_lead_hours ?? ""}
              trailing="hours"
              className="num"
            />
          </FormField>
        </FieldRow>
        <FormField name="how_to_book" label="How to book">
          <Input
            name="how_to_book"
            defaultValue={s?.how_to_book}
            placeholder="e.g. Email goods-in@… with PO number"
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Opening hours"
        description="Leave both times blank on days the site is closed."
      >
        <WeeklyHoursFields prefix="hours" hours={s?.opening_hours ?? {}} />
      </FormSection>

      <FormSection
        title="Delivery windows"
        description="If deliveries are only accepted at certain times. Leave blank if any time in opening hours is fine."
      >
        <WeeklyHoursFields
          prefix="window"
          hours={s?.delivery_windows ?? {}}
          startLabel="window starts"
          endLabel="window ends"
        />
      </FormSection>

      <FormSection title="Site rules">
        <Toggle
          name="ppe_required"
          label="PPE required"
          defaultChecked={s?.ppe_required ?? false}
        />
        <Toggle
          name="induction_required"
          label="Site induction required"
          defaultChecked={s?.induction_required ?? false}
        />
        <Toggle
          name="contact_must_be_present"
          label="Site contact must be present"
          description="The driver can't unload without them."
          defaultChecked={s?.contact_must_be_present ?? false}
        />
      </FormSection>

      <FormSection title="Instructions and notes">
        <FormField
          name="delivery_instructions"
          label="Delivery instructions"
          hint="Copied onto new orders for this site."
        >
          <Textarea
            name="delivery_instructions"
            defaultValue={s?.delivery_instructions ?? defaultInstructions}
          />
        </FormField>
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={s?.notes} rows={4} />
        </FormField>
      </FormSection>
    </>
  );
}
