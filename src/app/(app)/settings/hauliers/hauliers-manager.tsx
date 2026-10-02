"use client";

import { ChevronRight, Handshake, Star } from "lucide-react";
import Link from "next/link";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { CheckboxGroup } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { plural } from "@/lib/format";
import { HAULIER_SERVICES, HAULIER_TYPES, VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import { deleteHaulier, saveHaulier } from "./actions";

export type Haulier = {
  id: string;
  name: string;
  haulier_type: string;
  contact_name: string;
  phone: string;
  email: string;
  vehicle_types: string[];
  coverage_areas: string[];
  services: string[];
  notes: string;
  rating: number | null;
  active: boolean;
  rate_card_count: number;
};

export function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-text-subtle">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rated ${value} out of 5`}>
      <Star className="size-icon-sm fill-current text-text-muted" aria-hidden />
      <span className="num">{value}/5</span>
    </span>
  );
}

const coverage = (h: Haulier) =>
  h.coverage_areas.length ? h.coverage_areas.join(", ") : "Not set";

const columns: Column<Haulier>[] = [
  {
    id: "name",
    header: "Haulier",
    hideable: false,
    sortValue: (h) => h.name,
    cell: (h) => (
      <Link
        href={`/settings/hauliers/${h.id}`}
        className="inline-flex items-center gap-2 font-medium text-accent-text hover:underline"
      >
        {h.name}
        {!h.active ? <Badge>Inactive</Badge> : null}
      </Link>
    ),
  },
  {
    id: "type",
    header: "Type",
    sortValue: (h) => h.haulier_type,
    cell: (h) => labelFor(HAULIER_TYPES, h.haulier_type),
  },
  { id: "coverage", header: "Covers", cell: coverage },
  {
    id: "rating",
    header: "Rating",
    sortValue: (h) => h.rating ?? 0,
    cell: (h) => <Rating value={h.rating} />,
  },
  {
    id: "rates",
    header: "Rate cards",
    cell: (h) => (
      <Link
        href={`/settings/hauliers/${h.id}`}
        className="inline-flex items-center gap-1 text-accent-text hover:underline"
      >
        {h.rate_card_count ? plural(h.rate_card_count, "rate card") : "Add rates"}
        <ChevronRight className="size-icon-sm" aria-hidden />
      </Link>
    ),
  },
];

export function HaulierFields({ row }: { row: Haulier | null }) {
  const h = row;
  return (
    <>
      <FormSection title="Details">
        <FormField name="name" label="Name" required>
          <Input name="name" defaultValue={h?.name} />
        </FormField>
        <FieldRow>
          <FormField name="haulier_type" label="Type" required>
            <Select
              name="haulier_type"
              options={HAULIER_TYPES}
              defaultValue={h?.haulier_type ?? "haulier"}
            />
          </FormField>
          <FormField name="rating" label="Your rating" hint="Internal only.">
            <Select
              name="rating"
              options={[
                { value: "none", label: "Not rated" },
                ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} out of 5` })),
              ]}
              defaultValue={h?.rating ? String(h.rating) : "none"}
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="active"
          label="Active"
          description="Inactive hauliers aren't offered when comparing prices."
          defaultChecked={h?.active ?? true}
        />
      </FormSection>
      <FormSection title="Contact">
        <FormField name="contact_name" label="Contact name">
          <Input name="contact_name" defaultValue={h?.contact_name} />
        </FormField>
        <FieldRow>
          <FormField name="phone" label="Phone">
            <Input name="phone" type="tel" defaultValue={h?.phone} className="num" />
          </FormField>
          <FormField name="email" label="Email">
            <Input name="email" type="email" defaultValue={h?.email} />
          </FormField>
        </FieldRow>
      </FormSection>
      <FormSection title="What they offer">
        <FormField
          name="coverage_areas"
          label="Postcode areas covered"
          hint="e.g. GL, NP, CF. Leave blank for nationwide."
        >
          <Input
            name="coverage_areas"
            defaultValue={h?.coverage_areas.join(", ")}
            className="uppercase"
          />
        </FormField>
        <CheckboxGroup
          name="services"
          legend="Services"
          options={HAULIER_SERVICES}
          defaultValue={h?.services ?? []}
        />
        <CheckboxGroup
          name="vehicle_types"
          legend="Vehicle types available"
          options={VEHICLE_TYPES}
          defaultValue={h?.vehicle_types ?? []}
        />
      </FormSection>
      <FormSection title="Notes">
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={h?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function HauliersManager({ rows }: { rows: Haulier[] }) {
  return (
    <EntityManager
      rows={rows}
      getId={(h) => h.id}
      getName={(h) => h.name}
      singular="haulier"
      label="Hauliers"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(h, actions) => (
        <EntityCard
          title={
            <Link href={`/settings/hauliers/${h.id}`} className="text-accent-text hover:underline">
              {h.name}
            </Link>
          }
          badges={!h.active ? <Badge>Inactive</Badge> : null}
          lines={[
            `${labelFor(HAULIER_TYPES, h.haulier_type)} · covers ${coverage(h)}`,
            h.rate_card_count ? plural(h.rate_card_count, "rate card") : "No rate cards yet",
          ]}
          actions={actions}
        />
      )}
      renderFields={(row) => <HaulierFields row={row} />}
      save={saveHaulier}
      remove={deleteHaulier}
      deleteWarning="Its rate cards will be deleted too. This can't be undone."
      empty={{
        icon: Handshake,
        title: "No hauliers yet",
        description:
          "Add the hauliers and pallet networks you use, then their rate cards, to compare prices with your own vehicles.",
      }}
    />
  );
}
