"use client";

import { Building2, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { Column } from "@/components/ui/table";
import { matchesSearch } from "@/components/ui/combobox";
import type { Customer } from "@/lib/customers/types";
import { plural } from "@/lib/format";
import { deleteCustomer, saveCustomer } from "./actions";
import { CustomerFields } from "./customer-fields";

export type CustomerRow = Customer & {
  siteCount: number;
  contactCount: number;
  staleSites: number;
  postcodes: string[];
};

function StaleBadge({ count, showOk }: { count: number; showOk?: boolean }) {
  if (!count) return showOk ? <span className="text-text-subtle">Up to date</span> : null;
  return <Badge tone="info">{count === 1 ? "1 site to check" : `${count} sites to check`}</Badge>;
}

const NameLink = ({ c }: { c: CustomerRow }) => (
  <Link href={`/customers/${c.id}`} className="font-medium text-accent-text hover:underline">
    {c.name}
  </Link>
);

const columns: Column<CustomerRow>[] = [
  {
    id: "name",
    header: "Customer",
    hideable: false,
    sortValue: (c) => c.name,
    cell: (c) => <NameLink c={c} />,
  },
  {
    id: "ref",
    header: "Account ref",
    sortValue: (c) => c.account_ref,
    cell: (c) => c.account_ref || "–",
  },
  {
    id: "sites",
    header: "Sites",
    align: "right",
    sortValue: (c) => c.siteCount,
    cell: (c) => c.siteCount,
  },
  {
    id: "contacts",
    header: "Contacts",
    align: "right",
    sortValue: (c) => c.contactCount,
    cell: (c) => c.contactCount,
  },
  { id: "status", header: "Site details", cell: (c) => <StaleBadge count={c.staleSites} showOk /> },
];

export function CustomersManager({ rows, canEdit }: { rows: CustomerRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      query.trim()
        ? rows.filter((c) =>
            matchesSearch([c.name, c.account_ref, ...c.postcodes].join(" "), query),
          )
        : rows,
    [rows, query],
  );

  return (
    <EntityManager
      rows={filtered}
      getId={(c) => c.id}
      getName={(c) => c.name}
      singular="customer"
      label="Customers"
      columns={columns}
      initialSort={{ columnId: "name", direction: "asc" }}
      readOnly={!canEdit}
      toolbar={
        <Input
          type="search"
          leadingIcon={<Search />}
          placeholder="Name, account ref or postcode"
          aria-label="Search customers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="md:w-popover"
        />
      }
      hideCount
      emptyOverride={
        rows.length && !filtered.length ? (
          <EmptyState
            compact
            icon={SearchX}
            title="No customers match"
            description={`Nothing found for “${query}”. Check the spelling, or search by postcode.`}
            action={<Button onClick={() => setQuery("")}>Clear search</Button>}
          />
        ) : undefined
      }
      renderCard={(c, actions) => (
        <EntityCard
          title={<NameLink c={c} />}
          badges={<StaleBadge count={c.staleSites} />}
          lines={[
            [c.account_ref, plural(c.siteCount, "site"), plural(c.contactCount, "contact")]
              .filter(Boolean)
              .join(" · "),
          ]}
          actions={actions}
        />
      )}
      renderFields={(row) => <CustomerFields row={row} />}
      save={saveCustomer}
      remove={deleteCustomer}
      deleteWarning="Their sites and contacts will be deleted too. This can't be undone."
      empty={{
        icon: Building2,
        title: "No customers yet",
        description:
          "Add a customer, then their delivery sites. Each site's restrictions are checked automatically every time you plan a delivery.",
      }}
    />
  );
}
