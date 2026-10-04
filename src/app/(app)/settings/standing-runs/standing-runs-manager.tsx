"use client";

import { ArrowDown, ArrowUp, Repeat, X } from "lucide-react";
import { useState } from "react";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { CheckboxGroup } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { plural } from "@/lib/format";
import { DAYS } from "@/lib/settings/options";
import { deleteStandingRun, saveStandingRun } from "./actions";

export type StandingRun = {
  id: string;
  name: string;
  days: string[];
  cutoff_time: string;
  start_time: string;
  depot_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  active: boolean;
  notes: string;
  site_ids: string[];
};

type Named = { id: string; name: string };
type SiteOption = { id: string; name: string; postcode: string; customer: string };

const dayList = (r: StandingRun) =>
  DAYS.filter((d) => r.days.includes(d.value))
    .map((d) => d.label.slice(0, 3))
    .join(", ");

/** The run's regular sites in drop order, posted as repeated site_ids. */
function SiteOrder({ initial, sites }: { initial: string[]; sites: SiteOption[] }) {
  const [ids, setIds] = useState(initial);
  const byId = new Map(sites.map((s) => [s.id, s]));
  const move = (from: number, to: number) =>
    setIds((list) => {
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {ids.length ? (
        <ol aria-label="Sites in drop order" className="flex flex-col gap-2">
          {ids.map((id, i) => {
            const s = byId.get(id);
            return (
              <li
                key={id}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border p-2"
              >
                <input type="hidden" name="site_ids" value={id} />
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{s?.name ?? "Site"}</span>
                  <span className="truncate text-xs text-text-muted">
                    {s ? `${s.customer} · ${s.postcode}` : ""}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Move ${s?.name ?? "site"} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Move ${s?.name ?? "site"} down`}
                  disabled={i === ids.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Remove ${s?.name ?? "site"}`}
                  onClick={() => setIds((list) => list.filter((x) => x !== id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <FormField name="site_ids" label="Add a site">
        <Combobox
          value={null}
          onValueChange={(v) => v && setIds((list) => (list.includes(v) ? list : [...list, v]))}
          placeholder="Choose a site"
          searchPlaceholder="Customer, site or postcode"
          options={sites
            .filter((s) => !ids.includes(s.id))
            .map((s) => ({
              value: s.id,
              label: `${s.customer} · ${s.name}`,
              description: s.postcode,
              keywords: [s.postcode],
            }))}
        />
      </FormField>
    </div>
  );
}

function Fields({
  row,
  depots,
  vehicles,
  drivers,
  sites,
}: {
  row: StandingRun | null;
  depots: Named[];
  vehicles: Named[];
  drivers: Named[];
  sites: SiteOption[];
}) {
  const r = row;
  return (
    <>
      <FormSection title="Run">
        <FormField name="name" label="Name" required>
          <Input
            name="name"
            defaultValue={r?.name}
            autoComplete="off"
            placeholder="e.g. Cotswolds Tuesday"
          />
        </FormField>
        <CheckboxGroup
          name="days"
          legend="Runs on"
          options={DAYS}
          defaultValue={r?.days ?? []}
          columns={3}
        />
        <FieldRow>
          <FormField
            name="cutoff_time"
            label="Order cut-off"
            required
            hint="24-hour time. Orders received by then on the day are suggested for that day's run."
          >
            <Input
              name="cutoff_time"
              inputMode="numeric"
              placeholder="hh:mm"
              defaultValue={r?.cutoff_time ?? "12:00"}
              className="num"
            />
          </FormField>
          <FormField name="start_time" label="Leaves at" required hint="24-hour time, e.g. 07:30">
            <Input
              name="start_time"
              inputMode="numeric"
              placeholder="hh:mm"
              defaultValue={r?.start_time ?? "07:30"}
              className="num"
            />
          </FormField>
        </FieldRow>
        <Toggle
          name="active"
          label="Active"
          description="Inactive runs don't create draft loads."
          defaultChecked={r?.active ?? true}
        />
      </FormSection>
      <FormSection title="Defaults for each load">
        <FormField name="depot_id" label="Depot" required>
          <Select
            name="depot_id"
            defaultValue={r?.depot_id ?? depots[0]?.id}
            options={depots.map((d) => ({ value: d.id, label: d.name }))}
          />
        </FormField>
        <FieldRow>
          <FormField name="vehicle_id" label="Vehicle">
            <Select
              name="vehicle_id"
              defaultValue={r?.vehicle_id ?? "none"}
              options={[
                { value: "none", label: "Choose each time" },
                ...vehicles.map((v) => ({ value: v.id, label: v.name })),
              ]}
            />
          </FormField>
          <FormField name="driver_id" label="Driver">
            <Select
              name="driver_id"
              defaultValue={r?.driver_id ?? "none"}
              options={[
                { value: "none", label: "Choose each time" },
                ...drivers.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </FormField>
        </FieldRow>
      </FormSection>
      <FormSection title="Regular sites" description="In the order the run usually goes.">
        <SiteOrder initial={r?.site_ids ?? []} sites={sites} />
      </FormSection>
      <FormSection title="Notes">
        <FormField name="notes" label="Notes" hint="Copied onto each draft load.">
          <Textarea name="notes" defaultValue={r?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function StandingRunsManager({
  rows,
  depots,
  vehicles,
  drivers,
  sites,
}: {
  rows: StandingRun[];
  depots: Named[];
  vehicles: Named[];
  drivers: Named[];
  sites: SiteOption[];
}) {
  const nameOf = (list: Named[], id: string | null) => list.find((x) => x.id === id)?.name ?? null;
  const status = (r: StandingRun) => (r.active ? null : <Badge>Inactive</Badge>);
  const columns: Column<StandingRun>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {status(r)}
        </span>
      ),
    },
    { id: "days", header: "Runs on", cell: dayList },
    { id: "cutoff", header: "Cut-off", cell: (r) => <span className="num">{r.cutoff_time}</span> },
    { id: "sites", header: "Sites", cell: (r) => plural(r.site_ids.length, "site") },
    {
      id: "vehicle",
      header: "Vehicle and driver",
      cell: (r) =>
        [nameOf(vehicles, r.vehicle_id), nameOf(drivers, r.driver_id)]
          .filter(Boolean)
          .join(" · ") || "Chosen each time",
    },
  ];
  return (
    <EntityManager
      rows={rows}
      getId={(r) => r.id}
      getName={(r) => r.name}
      singular="standing run"
      label="Standing runs"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(r, actions) => (
        <EntityCard
          title={r.name}
          badges={status(r)}
          lines={[
            `${dayList(r)} · cut-off ${r.cutoff_time}`,
            plural(r.site_ids.length, "site"),
            [nameOf(vehicles, r.vehicle_id), nameOf(drivers, r.driver_id)]
              .filter(Boolean)
              .join(" · "),
          ].filter(Boolean)}
          actions={actions}
        />
      )}
      renderFields={(row) => (
        <Fields row={row} depots={depots} vehicles={vehicles} drivers={drivers} sites={sites} />
      )}
      save={saveStandingRun}
      remove={deleteStandingRun}
      deleteWarning="Draft loads it has already made stay on the plan."
      empty={{
        icon: Repeat,
        title: "No standing runs yet",
        description:
          "Set up routes you run every week. Each run day gets a draft load, and orders for its sites are suggested onto it.",
      }}
    />
  );
}
