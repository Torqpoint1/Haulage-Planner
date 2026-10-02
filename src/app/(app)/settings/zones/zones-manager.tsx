"use client";

import { Map as MapIcon } from "lucide-react";
import { FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { ColourDot, ColourPicker } from "@/components/settings/inputs";
import { Chip } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Column } from "@/components/ui/table";
import { deleteZone, saveZone } from "./actions";

export type Zone = { id: string; name: string; colour_tag: string; postcode_areas: string[] };

function Areas({ z }: { z: Zone }) {
  return (
    <span className="flex flex-wrap gap-1">
      {z.postcode_areas.map((a) => (
        <Chip key={a}>{a}</Chip>
      ))}
    </span>
  );
}

const columns: Column<Zone>[] = [
  {
    id: "name",
    header: "Zone",
    hideable: false,
    sortValue: (z) => z.name,
    cell: (z) => (
      <span className="flex items-center gap-2">
        <ColourDot tag={z.colour_tag} />
        <span className="font-medium">{z.name}</span>
      </span>
    ),
  },
  {
    id: "count",
    header: "Areas",
    align: "right",
    sortValue: (z) => z.postcode_areas.length,
    cell: (z) => z.postcode_areas.length,
  },
  { id: "areas", header: "Postcode areas", cell: (z) => <Areas z={z} /> },
];

function Fields({ row }: { row: Zone | null }) {
  return (
    <FormSection title="Zone">
      <FormField name="name" label="Name" required>
        <Input name="name" defaultValue={row?.name} placeholder="e.g. South Wales" />
      </FormField>
      <FormField
        name="postcode_areas"
        label="Postcode areas"
        required
        hint="The letters at the start of a postcode, separated by commas or spaces, e.g. CF, NP, SA."
      >
        <Input
          name="postcode_areas"
          defaultValue={row?.postcode_areas.join(", ")}
          className="uppercase"
        />
      </FormField>
      <ColourPicker name="colour_tag" defaultValue={row?.colour_tag ?? "load-1"} />
    </FormSection>
  );
}

export function ZonesManager({ rows }: { rows: Zone[] }) {
  return (
    <EntityManager
      rows={rows}
      getId={(z) => z.id}
      getName={(z) => z.name}
      singular="zone"
      label="Postcode zones"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(z, actions) => (
        <EntityCard
          leading={<ColourDot tag={z.colour_tag} className="mt-1" />}
          title={z.name}
          lines={[z.postcode_areas.join(", ")]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} />}
      save={saveZone}
      remove={deleteZone}
      deleteWarning="Prices for this zone on every rate card will be removed too. This can't be undone."
      empty={{
        icon: MapIcon,
        title: "No postcode zones yet",
        description: "Group postcode areas into zones so haulier prices can be set per zone.",
      }}
    />
  );
}
