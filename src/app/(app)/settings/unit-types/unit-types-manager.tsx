"use client";

import { Package, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { ColourDot, ColourPicker } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { formatKg, formatNumber } from "@/lib/format";
import { MIN_UNLOAD_METHODS, labelFor } from "@/lib/settings/options";
import { addCommonPallets, deleteUnitType, saveUnitType } from "./actions";

export type UnitType = {
  id: string;
  name: string;
  short_code: string;
  colour_tag: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  typical_weight_kg: number;
  stackable: boolean;
  max_stack_height: number | null;
  must_stay_upright: boolean;
  fragile: boolean;
  returnable: boolean;
  requires_two_people: boolean;
  min_unload_method: string;
  securing_notes: string;
};

const dims = (u: UnitType) =>
  `${formatNumber(u.length_mm)} × ${formatNumber(u.width_mm)} × ${formatNumber(u.height_mm)} mm`;

/** Handling rules as words, never colour alone. */
function Rules({ u }: { u: UnitType }) {
  const rules = [
    u.must_stay_upright && "Upright",
    u.fragile && "Fragile",
    u.returnable && "Returnable",
    u.requires_two_people && "Two-person",
    u.stackable && `Stacks ${u.max_stack_height ?? ""}`.trim(),
    u.min_unload_method !== "any" && labelFor(MIN_UNLOAD_METHODS, u.min_unload_method),
  ].filter(Boolean) as string[];
  if (!rules.length) return <span className="text-text-subtle">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {rules.map((r) => (
        <Badge key={r}>{r}</Badge>
      ))}
    </span>
  );
}

const columns: Column<UnitType>[] = [
  {
    id: "name",
    header: "Name",
    hideable: false,
    sortValue: (u) => u.name,
    cell: (u) => (
      <span className="flex items-center gap-2">
        <ColourDot tag={u.colour_tag} />
        <span className="font-medium">{u.name}</span>
        <span className="text-text-subtle">{u.short_code}</span>
      </span>
    ),
  },
  { id: "size", header: "Size (L × W × H)", cell: dims },
  {
    id: "weight",
    header: "Typical weight",
    align: "right",
    sortValue: (u) => u.typical_weight_kg,
    cell: (u) => formatKg(u.typical_weight_kg),
  },
  { id: "rules", header: "Handling", cell: (u) => <Rules u={u} /> },
];

function Fields({ row }: { row: UnitType | null }) {
  const u = row;
  return (
    <>
      <FormSection title="What it is">
        <FieldRow>
          <FormField name="name" label="Name" required>
            <Input name="name" defaultValue={u?.name} placeholder="e.g. Door pack" />
          </FormField>
          <FormField
            name="short_code"
            label="Short code"
            required
            hint="Shown on cards and pick sheets."
          >
            <Input
              name="short_code"
              defaultValue={u?.short_code}
              placeholder="e.g. DP"
              className="uppercase"
            />
          </FormField>
        </FieldRow>
        <ColourPicker name="colour_tag" defaultValue={u?.colour_tag ?? "load-1"} />
      </FormSection>
      <FormSection title="Size and weight">
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <FormField name="length_mm" label="Length" required>
            <Input
              name="length_mm"
              inputMode="numeric"
              defaultValue={u?.length_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
          <FormField name="width_mm" label="Width" required>
            <Input
              name="width_mm"
              inputMode="numeric"
              defaultValue={u?.width_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
          <FormField name="height_mm" label="Height" required>
            <Input
              name="height_mm"
              inputMode="numeric"
              defaultValue={u?.height_mm}
              trailing="mm"
              className="num"
            />
          </FormField>
        </div>
        <FieldRow>
          <FormField name="typical_weight_kg" label="Typical weight" required>
            <Input
              name="typical_weight_kg"
              inputMode="decimal"
              defaultValue={u?.typical_weight_kg ?? 0}
              trailing="kg"
              className="num"
            />
          </FormField>
        </FieldRow>
      </FormSection>
      <FormSection title="Handling" description="These drive the rules engine's checks.">
        <Toggle
          name="must_stay_upright"
          label="Must stay upright"
          description="Can't use a tail lift; needs a forklift or handballing."
          defaultChecked={u?.must_stay_upright}
        />
        <Toggle name="fragile" label="Fragile" defaultChecked={u?.fragile} />
        <Toggle
          name="returnable"
          label="Returnable asset"
          description="Tracked when left at a customer, e.g. stillages and A-frames."
          defaultChecked={u?.returnable}
        />
        <Toggle
          name="requires_two_people"
          label="Needs two people to handle"
          defaultChecked={u?.requires_two_people}
        />
        <Checkbox name="stackable" label="Stackable" defaultChecked={u?.stackable} />
        <FieldRow>
          <FormField
            name="max_stack_height"
            label="Maximum stack height"
            hint="Only used when stackable."
          >
            <Input
              name="max_stack_height"
              inputMode="numeric"
              defaultValue={u?.max_stack_height ?? ""}
              className="num"
            />
          </FormField>
          <FormField name="min_unload_method" label="Minimum unloading method">
            <Select
              name="min_unload_method"
              options={MIN_UNLOAD_METHODS}
              defaultValue={u?.min_unload_method ?? "any"}
            />
          </FormField>
        </FieldRow>
        <FormField name="securing_notes" label="Load securing notes" hint="Printed on run sheets.">
          <Textarea name="securing_notes" defaultValue={u?.securing_notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function UnitTypesManager({ rows }: { rows: UnitType[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const starter = (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await addCommonPallets();
          if (r.ok) {
            toast.success("Common pallet sizes added");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Sparkles aria-hidden />
      Add common pallets
    </Button>
  );
  return (
    <EntityManager
      rows={rows}
      getId={(u) => u.id}
      getName={(u) => u.name}
      singular="unit type"
      label="Handling unit types"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(u, actions) => (
        <EntityCard
          leading={<ColourDot tag={u.colour_tag} className="mt-1" />}
          title={`${u.name} · ${u.short_code}`}
          lines={[`${dims(u)} · ${formatKg(u.typical_weight_kg)}`]}
          badges={null}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} />}
      save={saveUnitType}
      remove={deleteUnitType}
      deleteWarning="It will also be removed from every vehicle's capacity list. This can't be undone."
      empty={{
        icon: Package,
        title: "No unit types yet",
        description:
          "Add the things you move, or start with the common pallet sizes and adjust them.",
      }}
      emptyAction={rows.length === 0 ? starter : undefined}
    />
  );
}
