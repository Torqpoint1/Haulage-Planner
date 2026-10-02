"use client";

import { MapPinOff, Warehouse } from "lucide-react";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { CheckboxGroup, WeeklyHoursFields } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { LOADING_EQUIPMENT, labelFor } from "@/lib/settings/options";
import { summariseHours } from "@/lib/settings/hours";
import type { OpeningHours } from "@/lib/settings/schemas";
import { deleteDepot, saveDepot } from "./actions";

export type Depot = {
  id: string;
  name: string;
  address: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  loading_equipment: string[];
  opening_hours: OpeningHours;
  is_default: boolean;
  notes: string;
};

const equipment = (d: Depot) =>
  d.loading_equipment.length
    ? d.loading_equipment.map((e) => labelFor(LOADING_EQUIPMENT, e)).join(", ")
    : "None recorded";

function LocationNote({ d }: { d: Depot }) {
  if (d.latitude !== null) return null;
  return (
    <Badge tone="info" icon={<MapPinOff aria-hidden />}>
      No map position
    </Badge>
  );
}

const columns: Column<Depot>[] = [
  {
    id: "name",
    header: "Name",
    hideable: false,
    sortValue: (d) => d.name,
    cell: (d) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{d.name}</span>
        {d.is_default ? <Badge tone="success">Default</Badge> : null}
      </span>
    ),
  },
  {
    id: "postcode",
    header: "Postcode",
    sortValue: (d) => d.postcode,
    cell: (d) => (
      <span className="flex items-center gap-2">
        {d.postcode}
        <LocationNote d={d} />
      </span>
    ),
  },
  { id: "hours", header: "Opening hours", cell: (d) => summariseHours(d.opening_hours) },
  { id: "equipment", header: "Loading equipment", cell: equipment },
];

function Fields({ row }: { row: Depot | null }) {
  const d = row;
  return (
    <>
      <FormSection title="Details">
        <FormField name="name" label="Name" required>
          <Input name="name" defaultValue={d?.name} placeholder="e.g. Stroud factory" />
        </FormField>
        <FormField name="address" label="Address">
          <Textarea name="address" defaultValue={d?.address} rows={2} />
        </FormField>
        <FieldRow>
          <FormField
            name="postcode"
            label="Postcode"
            required
            hint="Used to place the depot on the map."
          >
            <Input
              name="postcode"
              defaultValue={d?.postcode}
              autoComplete="postal-code"
              className="uppercase"
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="is_default"
          label="Default depot"
          description="New loads start here unless you choose another."
          defaultChecked={d?.is_default ?? false}
        />
      </FormSection>
      <FormSection title="Loading equipment">
        <CheckboxGroup
          name="loading_equipment"
          legend="Available at this depot"
          options={LOADING_EQUIPMENT}
          defaultValue={d?.loading_equipment ?? []}
        />
      </FormSection>
      <FormSection title="Opening hours" description="Leave both times blank on days it's closed.">
        <WeeklyHoursFields prefix="hours" hours={d?.opening_hours ?? defaultHours()} />
      </FormSection>
      <FormSection title="Notes">
        <FormField name="notes" label="Notes for planners">
          <Textarea name="notes" defaultValue={d?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

function defaultHours(): OpeningHours {
  const weekday = { open: "07:00", close: "17:00" };
  return {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: null,
    sun: null,
  };
}

export function DepotsManager({ rows }: { rows: Depot[] }) {
  return (
    <EntityManager
      rows={rows}
      getId={(d) => d.id}
      getName={(d) => d.name}
      singular="depot"
      label="Depots"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(d, actions) => (
        <EntityCard
          title={d.name}
          badges={
            <>
              {d.is_default ? <Badge tone="success">Default</Badge> : null}
              <LocationNote d={d} />
            </>
          }
          lines={[d.postcode, summariseHours(d.opening_hours), equipment(d)]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} />}
      save={saveDepot}
      remove={deleteDepot}
      empty={{
        icon: Warehouse,
        title: "No depots yet",
        description: "Add the factory or warehouse your loads leave from.",
      }}
    />
  );
}
