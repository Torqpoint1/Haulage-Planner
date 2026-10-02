"use client";

import { Truck } from "lucide-react";
import Link from "next/link";
import { FieldRow, FormField, FormSection, useFormErrors } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { CheckboxGroup, ColourDot } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { formatGbp, formatKg, formatLocalDate, fromIsoDate } from "@/lib/format";
import { UNLOAD_METHODS, VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import { deleteVehicle, saveVehicle } from "./actions";

export type UnitTypeOption = { id: string; name: string; short_code: string; colour_tag: string };

export type Vehicle = {
  id: string;
  name: string;
  registration: string;
  vehicle_type: string;
  ownership: "owned" | "hired";
  deck_length_mm: number;
  deck_width_mm: number;
  deck_height_mm: number;
  payload_kg: number;
  gross_weight_kg: number;
  overall_length_m: number;
  unload_methods: string[];
  tail_lift_max_kg: number | null;
  crane_max_kg: number | null;
  crew_size_default: 1 | 2;
  euro_standard: string;
  london_hgv_permit: boolean;
  london_hgv_permit_expires: string | null;
  caz_compliant: boolean;
  cost_per_mile: number;
  cost_per_driver_hour: number;
  active: boolean;
  off_road_from: string | null;
  off_road_until: string | null;
  capacities: { unit_type_id: string; max_units: number }[];
};

type Status = { tone: "success" | "warning" | "neutral"; label: string };

export function vehicleStatus(v: Vehicle, today: string): Status {
  if (!v.active) return { tone: "neutral", label: "Inactive" };
  const from = v.off_road_from;
  const until = v.off_road_until;
  if (from && from <= today && (!until || until >= today)) {
    return {
      tone: "warning",
      label: until ? `Off road until ${formatLocalDate(fromIsoDate(until))}` : "Off road",
    };
  }
  return { tone: "success", label: "Available" };
}

function StatusBadge({ v, today }: { v: Vehicle; today: string }) {
  const s = vehicleStatus(v, today);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function capacitySummary(v: Vehicle, unitTypes: UnitTypeOption[]) {
  const parts = v.capacities
    .map((c) => {
      const u = unitTypes.find((t) => t.id === c.unit_type_id);
      return u ? `${c.max_units} ${u.short_code}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not set";
}

const typeLabel = (v: Vehicle) => labelFor(VEHICLE_TYPES, v.vehicle_type);

function CapacityFields({
  vehicle,
  unitTypes,
}: {
  vehicle: Vehicle | null;
  unitTypes: UnitTypeOption[];
}) {
  const { errors } = useFormErrors();
  if (!unitTypes.length) {
    return (
      <p className="text-sm text-text-muted">
        Add your{" "}
        <Link
          href="/settings/unit-types"
          className="font-medium text-accent-text underline underline-offset-2"
        >
          handling unit types
        </Link>{" "}
        first, then set how many of each this vehicle carries.
      </p>
    );
  }
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {unitTypes.map((u) => {
        const name = `capacity_${u.id}`;
        const current = vehicle?.capacities.find((c) => c.unit_type_id === u.id)?.max_units;
        return (
          <FormField
            key={u.id}
            name={name}
            label={
              <span className="inline-flex items-center gap-2">
                <ColourDot tag={u.colour_tag} />
                {u.name}
              </span>
            }
          >
            <Input
              name={name}
              inputMode="numeric"
              defaultValue={current ?? ""}
              placeholder="0"
              className="num"
              invalid={Boolean(errors[name])}
            />
          </FormField>
        );
      })}
    </div>
  );
}

function Fields({ row, unitTypes }: { row: Vehicle | null; unitTypes: UnitTypeOption[] }) {
  const v = row;
  const date = (iso: string | null | undefined) => (iso ? fromIsoDate(iso) : null);
  return (
    <>
      <FormSection title="Details">
        <FieldRow>
          <FormField name="name" label="Name" required>
            <Input name="name" defaultValue={v?.name} placeholder="e.g. Luton 1" />
          </FormField>
          <FormField name="registration" label="Registration" required>
            <Input
              name="registration"
              defaultValue={v?.registration}
              placeholder="AB12 CDE"
              className="uppercase"
            />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField name="vehicle_type" label="Type" required>
            <Select
              name="vehicle_type"
              options={VEHICLE_TYPES}
              defaultValue={v?.vehicle_type}
              placeholder="Choose a type"
            />
          </FormField>
          <FormField name="ownership" label="Owned or hired">
            <Select
              name="ownership"
              options={[
                { value: "owned", label: "Owned" },
                { value: "hired", label: "Hired" },
              ]}
              defaultValue={v?.ownership ?? "owned"}
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="active"
          label="Active"
          description="Inactive vehicles aren't offered when planning."
          defaultChecked={v?.active ?? true}
        />
      </FormSection>

      <FormSection
        title="Deck and weights"
        description="Internal deck size, used with weight to check mixed loads."
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <FormField name="deck_length_mm" label="Deck length" required>
            <Input
              name="deck_length_mm"
              inputMode="numeric"
              defaultValue={v?.deck_length_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
          <FormField name="deck_width_mm" label="Deck width" required>
            <Input
              name="deck_width_mm"
              inputMode="numeric"
              defaultValue={v?.deck_width_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
          <FormField name="deck_height_mm" label="Deck height" required>
            <Input
              name="deck_height_mm"
              inputMode="numeric"
              defaultValue={v?.deck_height_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <FormField name="payload_kg" label="Payload" required>
            <Input
              name="payload_kg"
              inputMode="numeric"
              defaultValue={v?.payload_kg}
              trailing="kg"
              className="num"
            />
          </FormField>
          <FormField name="gross_weight_kg" label="Gross weight" required>
            <Input
              name="gross_weight_kg"
              inputMode="numeric"
              defaultValue={v?.gross_weight_kg}
              trailing="kg"
              className="num"
            />
          </FormField>
          <FormField
            name="overall_length_m"
            label="Overall length"
            required
            hint="For site access limits."
          >
            <Input
              name="overall_length_m"
              inputMode="decimal"
              defaultValue={v?.overall_length_m}
              trailing="m"
              className="num"
            />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Unloading">
        <CheckboxGroup
          name="unload_methods"
          legend="Unloading methods"
          options={UNLOAD_METHODS}
          defaultValue={v?.unload_methods ?? []}
        />
        <FieldRow>
          <FormField
            name="tail_lift_max_kg"
            label="Tail lift maximum"
            hint="Only used if it has a tail lift."
          >
            <Input
              name="tail_lift_max_kg"
              inputMode="numeric"
              defaultValue={v?.tail_lift_max_kg ?? 750}
              trailing="kg"
              className="num"
            />
          </FormField>
          <FormField name="crane_max_kg" label="Crane maximum" hint="Only used if it has a crane.">
            <Input
              name="crane_max_kg"
              inputMode="numeric"
              defaultValue={v?.crane_max_kg ?? ""}
              trailing="kg"
              className="num"
            />
          </FormField>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Capacity"
        description="How many of each unit type fit on their own, e.g. 12 pallets or 6 stillages. Leave blank if it can't carry them."
      >
        <CapacityFields vehicle={v} unitTypes={unitTypes} />
      </FormSection>

      <FormSection title="Crew and compliance">
        <FieldRow>
          <FormField name="crew_size_default" label="Usual crew">
            <Select
              name="crew_size_default"
              options={[
                { value: "1", label: "1 person" },
                { value: "2", label: "2 people" },
              ]}
              defaultValue={String(v?.crew_size_default ?? 1)}
            />
          </FormField>
          <FormField name="euro_standard" label="Euro emissions standard">
            <Input name="euro_standard" defaultValue={v?.euro_standard} placeholder="e.g. Euro 6" />
          </FormField>
        </FieldRow>
        <Toggle
          name="caz_compliant"
          label="Clean air zone compliant"
          defaultChecked={v?.caz_compliant ?? false}
        />
        <Toggle
          name="london_hgv_permit"
          label="London HGV safety permit"
          defaultChecked={v?.london_hgv_permit ?? false}
        />
        <FieldRow>
          <FormField
            name="london_hgv_permit_expires"
            label="Permit expires"
            hint="Only used if it has a permit."
          >
            <DatePicker
              name="london_hgv_permit_expires"
              defaultValue={date(v?.london_hgv_permit_expires)}
            />
          </FormField>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Running costs"
        description="Used to compare your own vehicle with hauliers."
      >
        <FieldRow>
          <FormField name="cost_per_mile" label="Cost per mile" required>
            <Input
              name="cost_per_mile"
              inputMode="decimal"
              defaultValue={v ? Number(v.cost_per_mile).toFixed(2) : ""}
              leadingIcon={<span className="text-sm">£</span>}
              className="num"
            />
          </FormField>
          <FormField name="cost_per_driver_hour" label="Cost per driver hour" required>
            <Input
              name="cost_per_driver_hour"
              inputMode="decimal"
              defaultValue={v ? Number(v.cost_per_driver_hour).toFixed(2) : ""}
              leadingIcon={<span className="text-sm">£</span>}
              className="num"
            />
          </FormField>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Off road"
        description="For servicing or repairs. Leave the end blank if unknown."
      >
        <FieldRow>
          <FormField name="off_road_from" label="From">
            <DatePicker name="off_road_from" defaultValue={date(v?.off_road_from)} />
          </FormField>
          <FormField name="off_road_until" label="Until">
            <DatePicker name="off_road_until" defaultValue={date(v?.off_road_until)} />
          </FormField>
        </FieldRow>
      </FormSection>
    </>
  );
}

export function VehiclesManager({
  rows,
  unitTypes,
  today,
}: {
  rows: Vehicle[];
  unitTypes: UnitTypeOption[];
  today: string;
}) {
  const columns: Column<Vehicle>[] = [
    {
      id: "name",
      header: "Vehicle",
      hideable: false,
      sortValue: (v) => v.name,
      cell: (v) => (
        <span className="flex flex-col">
          <span className="font-medium">{v.name}</span>
          <span className="text-text-subtle">{v.registration}</span>
        </span>
      ),
    },
    { id: "type", header: "Type", sortValue: typeLabel, cell: typeLabel },
    {
      id: "payload",
      header: "Payload",
      align: "right",
      sortValue: (v) => v.payload_kg,
      cell: (v) => formatKg(v.payload_kg),
    },
    { id: "capacity", header: "Capacity", cell: (v) => capacitySummary(v, unitTypes) },
    {
      id: "cost",
      header: "Per mile",
      align: "right",
      sortValue: (v) => v.cost_per_mile,
      cell: (v) => formatGbp(v.cost_per_mile),
    },
    { id: "status", header: "Status", cell: (v) => <StatusBadge v={v} today={today} /> },
  ];

  return (
    <EntityManager
      rows={rows}
      getId={(v) => v.id}
      getName={(v) => v.name}
      singular="vehicle"
      label="Vehicles"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(v, actions) => (
        <EntityCard
          title={`${v.name} · ${v.registration}`}
          badges={<StatusBadge v={v} today={today} />}
          lines={[
            `${typeLabel(v)} · ${formatKg(v.payload_kg)} payload`,
            capacitySummary(v, unitTypes),
          ]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} unitTypes={unitTypes} />}
      save={saveVehicle}
      remove={deleteVehicle}
      empty={{
        icon: Truck,
        title: "No vehicles yet",
        description:
          "Add your own vans and lorries so the app can check capacity, access and cost.",
      }}
    />
  );
}
