"use client";

import { ShieldAlert } from "lucide-react";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { Truncate } from "@/components/ui/truncate";
import { formatIsoDate, formatKg, plural } from "@/lib/format";
import { COMPLIANCE_REQUIREMENTS, labelFor } from "@/lib/settings/options";
import { deleteComplianceZone, saveComplianceZone } from "./actions";

export type ComplianceZone = {
  id: string;
  name: string;
  requirement: string;
  min_gross_kg: number | null;
  max_gross_kg: number | null;
  postcode_districts: string[];
  data_updated_on: string;
  notes: string;
  active: boolean;
};

/** "Over 3,500 kg", "Up to 3,500 kg" or "All vehicles". */
export function appliesTo(z: Pick<ComplianceZone, "min_gross_kg" | "max_gross_kg">) {
  if (z.min_gross_kg != null && z.max_gross_kg != null)
    return `${formatKg(z.min_gross_kg)} to ${formatKg(z.max_gross_kg)}`;
  if (z.min_gross_kg != null) return `${formatKg(z.min_gross_kg)} and over`;
  if (z.max_gross_kg != null) return `Up to ${formatKg(z.max_gross_kg)}`;
  return "All vehicles";
}

const columns: Column<ComplianceZone>[] = [
  {
    id: "name",
    header: "Zone",
    hideable: false,
    sortValue: (z) => z.name,
    cell: (z) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{z.name}</span>
        {z.active ? null : <Badge size="sm">Not in use</Badge>}
      </span>
    ),
  },
  {
    id: "requirement",
    header: "Vehicles need",
    sortValue: (z) => z.requirement,
    cell: (z) => labelFor(COMPLIANCE_REQUIREMENTS, z.requirement),
  },
  { id: "applies", header: "Applies to", cell: (z) => appliesTo(z) },
  {
    id: "districts",
    header: "Postcodes",
    cell: (z) => <Truncate className="max-w-menu">{z.postcode_districts.join(", ")}</Truncate>,
  },
  {
    id: "updated",
    header: "Data date",
    align: "right",
    sortValue: (z) => z.data_updated_on,
    cell: (z) => <span className="num">{formatIsoDate(z.data_updated_on)}</span>,
  },
];

function Fields({ row }: { row: ComplianceZone | null }) {
  return (
    <>
      <FormSection title="Zone">
        <FormField name="name" label="Name" required>
          <Input
            name="name"
            defaultValue={row?.name}
            placeholder="e.g. Oxford Zero Emission Zone"
          />
        </FormField>
        <FormField name="requirement" label="Vehicles need" required>
          <Select
            name="requirement"
            options={[...COMPLIANCE_REQUIREMENTS]}
            defaultValue={row?.requirement}
            placeholder="Choose…"
          />
        </FormField>
        <FieldRow>
          <FormField name="min_gross_kg" label="Applies from" hint="Gross weight; blank for any.">
            <Input
              name="min_gross_kg"
              defaultValue={row?.min_gross_kg ?? ""}
              inputMode="numeric"
              trailing="kg"
              className="num"
            />
          </FormField>
          <FormField name="max_gross_kg" label="Applies up to" hint="Gross weight; blank for any.">
            <Input
              name="max_gross_kg"
              defaultValue={row?.max_gross_kg ?? ""}
              inputMode="numeric"
              trailing="kg"
              className="num"
            />
          </FormField>
        </FieldRow>
        <FormField
          name="postcode_districts"
          label="Postcode areas and districts"
          required
          hint="Whole areas (EC) or districts (BR1), separated by commas or spaces."
        >
          <Textarea
            name="postcode_districts"
            defaultValue={row?.postcode_districts.join(", ")}
            className="uppercase"
          />
        </FormField>
        <Toggle
          name="active"
          label="In use"
          description="Zones not in use aren't checked when planning."
          defaultChecked={row?.active ?? true}
        />
      </FormSection>
      <FormSection title="Notes">
        <FormField
          name="notes"
          label="Notes"
          hint="e.g. charges and exemptions, shown to planners."
        >
          <Textarea name="notes" defaultValue={row?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function ComplianceZonesManager({ rows }: { rows: ComplianceZone[] }) {
  return (
    <EntityManager
      rows={rows}
      getId={(z) => z.id}
      getName={(z) => z.name}
      singular="zone"
      label="Compliance zones"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(z, actions) => (
        <EntityCard
          title={z.name}
          lines={[
            `${labelFor(COMPLIANCE_REQUIREMENTS, z.requirement)} · ${appliesTo(z)}`,
            `${plural(z.postcode_districts.length, "postcode area or district", "postcode areas or districts")} · data ${formatIsoDate(z.data_updated_on)}`,
          ]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} />}
      save={saveComplianceZone}
      remove={deleteComplianceZone}
      deleteWarning="Stops in this zone won't be checked against it any more."
      empty={{
        icon: ShieldAlert,
        title: "No compliance zones",
        description:
          "Add London or clean air zone rules so planning can warn about non-compliant vehicles.",
      }}
    />
  );
}
