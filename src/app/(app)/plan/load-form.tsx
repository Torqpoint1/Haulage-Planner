"use client";

import { useState } from "react";
import { EntityForm, FieldRow, FormField } from "@/components/settings/entity-form";
import { CheckboxGroup } from "@/components/settings/inputs";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import type { PlanData, PlanLoad } from "@/lib/planning/types";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import { dayKey } from "@/lib/rules/time";
import type { FormState } from "@/lib/settings/result";
import { saveLoad } from "./actions";

/** Vehicles that are off road on a date can't be chosen for it. */
function offRoad(v: PlanData["vehicles"][number], date: string) {
  return (
    !v.active ||
    Boolean(
      v.off_road_from && v.off_road_from <= date && (!v.off_road_until || v.off_road_until >= date),
    )
  );
}

export function LoadFormModal({
  open,
  onOpenChange,
  data,
  load,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PlanData;
  /** Null to create a load. */
  load: PlanLoad | null;
  defaultDate: string;
  onSaved: (state: FormState) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(load?.load_date ?? defaultDate);
  const defaultDepot = data.depots.find((d) => d.is_default) ?? data.depots[0];
  const day = dayKey(date);
  const busy = new Set(
    data.loads.filter((l) => l.id !== load?.id && l.load_date === date).map((l) => l.vehicle_id),
  );

  const assignmentOptions = [
    { value: "none", label: "Not decided yet" },
    ...data.vehicles.map((v) => ({
      value: `vehicle:${v.id}`,
      label: `${v.name} · ${labelFor(VEHICLE_TYPES, v.vehicle_type)}${offRoad(v, date) ? " (off road)" : busy.has(v.id) ? " (on another load)" : ""}`,
      disabled: offRoad(v, date),
    })),
    ...data.hauliers.map((h) => ({ value: `haulier:${h.id}`, label: `Haulier: ${h.name}` })),
  ];
  const current = load?.vehicle_id
    ? `vehicle:${load.vehicle_id}`
    : load?.haulier_id
      ? `haulier:${load.haulier_id}`
      : "none";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={load ? "Edit load" : "New load"}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="load-form" variant="primary" loading={saving}>
            {load ? "Save load" : "Create load"}
          </Button>
        </>
      }
    >
      <EntityForm
        id="load-form"
        action={(fd) => {
          if (fd.get("assignment") === "none") fd.set("assignment", "");
          return saveLoad(load?.id ?? null, fd);
        }}
        onPendingChange={setSaving}
        onSaved={onSaved}
      >
        <FieldRow>
          <FormField name="load_date" label="Date" required>
            <DatePicker
              name="load_date"
              defaultValue={fromIsoDate(load?.load_date ?? defaultDate)}
              onValueChange={(d) => d && setDate(toIsoDate(d))}
            />
          </FormField>
          <FormField name="start_time" label="Leaves the depot at" required>
            <Input
              name="start_time"
              defaultValue={load?.start_time ?? "07:30"}
              inputMode="numeric"
              className="num"
            />
          </FormField>
        </FieldRow>
        <FormField name="depot_id" label="Depot" required>
          <Select
            name="depot_id"
            options={data.depots.map((d) => ({ value: d.id, label: d.name }))}
            defaultValue={load?.depot_id ?? defaultDepot?.id}
            placeholder="Choose a depot"
          />
        </FormField>
        <FormField name="assignment" label="Vehicle or haulier" hint="You can decide later.">
          <Select name="assignment" options={assignmentOptions} defaultValue={current} />
        </FormField>
        <FormField
          name="agreed_price"
          label="Agreed price"
          hint="Hauliers only: what they'll charge. Reports use the rate card when it's blank."
        >
          <Input
            name="agreed_price"
            inputMode="decimal"
            defaultValue={load?.agreed_price ?? ""}
            leadingIcon={<span className="text-sm">£</span>}
            className="num"
          />
        </FormField>
        {data.drivers.length ? (
          <CheckboxGroup
            name="driver_ids"
            legend="Drivers"
            hint={`Drivers who don't usually work ${labelFor(DAY_LABELS, day)}s are marked.`}
            options={data.drivers.map((d) => ({
              value: d.id,
              label: d.available_days.includes(day)
                ? d.name
                : `${d.name} (not usually ${labelFor(DAY_LABELS, day)})`,
            }))}
            defaultValue={load?.driver_ids ?? []}
          />
        ) : null}
        <FormField name="crew_size" label="Crew" hint="Including the driver.">
          <Select
            name="crew_size"
            options={[1, 2, 3, 4].map((n) => ({
              value: String(n),
              label: n === 1 ? "1 person" : `${n} people`,
            }))}
            defaultValue={String(load?.crew_size ?? 1)}
          />
        </FormField>
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={load?.notes} />
        </FormField>
      </EntityForm>
    </Modal>
  );
}

const DAY_LABELS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];
