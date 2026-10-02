"use client";

import { IdCard, Link2 } from "lucide-react";
import Link from "next/link";
import { FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { CheckboxGroup } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Column } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { DAYS, LICENCE_CATEGORIES } from "@/lib/settings/options";
import { deleteDriver, saveDriver } from "./actions";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  licence_categories: string[];
  user_id: string | null;
  available_days: string[];
  active: boolean;
  notes: string;
};

export type DriverLogin = { userId: string; label: string };

const days = (d: Driver) =>
  d.available_days.length === 0
    ? "No days set"
    : DAYS.filter((day) => d.available_days.includes(day.value))
        .map((day) => day.label.slice(0, 3))
        .join(", ");

const licences = (d: Driver) =>
  d.licence_categories.length ? d.licence_categories.join(", ") : "None recorded";

function Fields({ row, logins }: { row: Driver | null; logins: DriverLogin[] }) {
  const d = row;
  return (
    <>
      <FormSection title="Details">
        <FormField name="name" label="Name" required>
          <Input name="name" defaultValue={d?.name} autoComplete="off" />
        </FormField>
        <FieldRow>
          <FormField name="phone" label="Phone">
            <Input name="phone" type="tel" defaultValue={d?.phone} className="num" />
          </FormField>
        </FieldRow>
        <Toggle
          name="active"
          label="Active"
          description="Inactive drivers aren't offered when planning."
          defaultChecked={d?.active ?? true}
        />
      </FormSection>
      <FormSection title="Licence">
        <CheckboxGroup
          name="licence_categories"
          legend="Licence categories"
          options={LICENCE_CATEGORIES}
          defaultValue={d?.licence_categories ?? []}
        />
      </FormSection>
      <FormSection title="Availability">
        <CheckboxGroup
          name="available_days"
          legend="Usually works on"
          options={DAYS}
          defaultValue={d?.available_days ?? ["mon", "tue", "wed", "thu", "fri"]}
          columns={3}
        />
      </FormSection>
      <FormSection
        title="Login"
        description="Link the driver's own login so they can see their run sheet on their phone."
      >
        {logins.length ? (
          <FormField name="user_id" label="Linked login">
            <Select
              name="user_id"
              options={[
                { value: "none", label: "Not linked" },
                ...logins.map((l) => ({ value: l.userId, label: l.label })),
              ]}
              defaultValue={d?.user_id ?? "none"}
            />
          </FormField>
        ) : (
          <p className="text-sm text-text-muted">
            No one has the Driver role yet.{" "}
            <Link
              href="/settings/users"
              className="font-medium text-accent-text underline underline-offset-2"
            >
              Invite a driver
            </Link>{" "}
            to link their login here.
          </p>
        )}
      </FormSection>
      <FormSection title="Notes">
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={d?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function DriversManager({ rows, logins }: { rows: Driver[]; logins: DriverLogin[] }) {
  const linked = (d: Driver) =>
    d.user_id ? (
      <Badge tone="info" icon={<Link2 aria-hidden />}>
        Login linked
      </Badge>
    ) : null;
  const status = (d: Driver) => (d.active ? null : <Badge>Inactive</Badge>);

  const columns: Column<Driver>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortValue: (d) => d.name,
      cell: (d) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{d.name}</span>
          {status(d)}
        </span>
      ),
    },
    { id: "phone", header: "Phone", cell: (d) => <span className="num">{d.phone || "–"}</span> },
    { id: "licence", header: "Licence", cell: licences },
    { id: "days", header: "Works", cell: days },
    {
      id: "login",
      header: "Login",
      cell: (d) => linked(d) ?? <span className="text-text-subtle">Not linked</span>,
    },
  ];

  return (
    <EntityManager
      rows={rows}
      getId={(d) => d.id}
      getName={(d) => d.name}
      singular="driver"
      label="Drivers"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      renderCard={(d, actions) => (
        <EntityCard
          title={d.name}
          badges={
            <>
              {status(d)}
              {linked(d)}
            </>
          }
          lines={[d.phone, `Licence: ${licences(d)}`, `Works: ${days(d)}`]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} logins={logins} />}
      save={saveDriver}
      remove={deleteDriver}
      empty={{
        icon: IdCard,
        title: "No drivers yet",
        description: "Add the people who drive your own vehicles.",
      }}
    />
  );
}
