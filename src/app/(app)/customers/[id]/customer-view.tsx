"use client";

import { AssetStatusBadge } from "@/components/assets/asset-status";
import type { AssetRow } from "@/lib/assets/data";
import { formatIsoDate, plural } from "@/lib/format";

import { Boxes, Contact as ContactIcon, MapPin, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FreshnessBadge, RestrictionChips } from "@/components/customers/site-badges";
import { MapPanel } from "@/components/map/map-panel";
import type { MapPin as Pin } from "@/components/map/types";
import { EntityForm, FieldRow, FormField, FormSection } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import type { Column } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { siteFreshness } from "@/lib/customers/sites";
import type { Contact, Customer, Site } from "@/lib/customers/types";
import {
  deleteContact,
  deleteCustomer,
  deleteSite,
  saveContact,
  saveCustomer,
  saveSite,
  type SiteSaveState,
} from "../actions";
import { CustomerFields } from "../customer-fields";
import { CustomerOrders, type CustomerOrder } from "./customer-orders";
import { SiteFields } from "./site-fields";

type Props = {
  customer: Customer;
  sites: Site[];
  contacts: Contact[];
  staleDays: number;
  canEdit: boolean;
  initialTab: string;
  /** Returnable assets at this customer's sites. */
  assets: AssetRow[];
  canSeeAssets: boolean;
  orders: { rows: CustomerOrder[]; total: number; canSee: boolean; canEdit: boolean };
};

export function CustomerView({
  customer,
  sites,
  contacts,
  staleDays,
  canEdit,
  initialTab,
  assets,
  canSeeAssets,
  orders,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const freshness = useMemo(() => {
    const now = new Date();
    return new Map(sites.map((s) => [s.id, siteFreshness(s.last_verified_at, staleDays, now)]));
  }, [sites, staleDays]);

  const pins: Pin[] = sites
    .filter((s) => s.latitude !== null && s.longitude !== null)
    .map((s) => ({
      id: s.id,
      lat: s.latitude!,
      lng: s.longitude!,
      label: `${s.name}, ${s.postcode}`,
      colour: "load-1",
    }));

  const siteHref = (s: Site) => `/customers/${customer.id}/sites/${s.id}`;
  const SiteLink = ({ s }: { s: Site }) => (
    <Link href={siteHref(s)} className="font-medium text-accent-text hover:underline">
      {s.name}
    </Link>
  );

  const siteColumns: Column<Site>[] = [
    {
      id: "name",
      header: "Site",
      hideable: false,
      sortValue: (s) => s.name,
      cell: (s) => <SiteLink s={s} />,
    },
    {
      id: "postcode",
      header: "Postcode",
      sortValue: (s) => s.postcode,
      cell: (s) => (
        <span className="inline-flex items-center gap-1">
          {s.postcode}
          {s.latitude === null ? <span className="text-text-subtle">· no pin</span> : null}
        </span>
      ),
    },
    {
      id: "restrictions",
      header: "Restrictions",
      cell: (s) => <RestrictionChips site={s} limit={3} />,
    },
    {
      id: "verified",
      header: "Details",
      cell: (s) => <FreshnessBadge freshness={freshness.get(s.id)!} />,
    },
  ];

  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "All sites";

  const contactColumns: Column<Contact>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.name}</span>
          {c.job_role ? <span className="text-text-subtle">{c.job_role}</span> : null}
        </span>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (c) =>
        c.phone ? (
          <a
            href={`tel:${c.phone.replace(/\s/g, "")}`}
            className="num text-accent-text hover:underline"
          >
            {c.phone}
          </a>
        ) : (
          "–"
        ),
    },
    {
      id: "email",
      header: "Email",
      cell: (c) =>
        c.email ? (
          <a href={`mailto:${c.email}`} className="text-accent-text hover:underline">
            {c.email}
          </a>
        ) : (
          "–"
        ),
    },
    {
      id: "site",
      header: "Site",
      sortValue: (c) => siteName(c.site_id),
      cell: (c) => siteName(c.site_id),
    },
  ];

  return (
    <>
      <SettingsHeader
        title={customer.name}
        description={customer.account_ref ? `Account ref ${customer.account_ref}` : undefined}
        backHref="/customers"
        backLabel="Customers"
        actions={
          canEdit ? (
            <>
              <Button onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit customer
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <Tabs defaultValue={initialTab}>
        <TabsList aria-label={`${customer.name} details`}>
          <TabsTrigger value="sites" count={sites.length}>
            Sites
          </TabsTrigger>
          <TabsTrigger value="contacts" count={contacts.length}>
            Contacts
          </TabsTrigger>
          <TabsTrigger value="orders" count={orders.total}>
            Orders
          </TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="flex flex-col gap-6">
          {pins.length ? (
            <MapPanel
              title="Sites"
              pins={pins}
              selectedId={selectedSite}
              onSelect={(id) => {
                setSelectedSite(id);
                router.push(siteHref(sites.find((s) => s.id === id)!));
              }}
              className="h-modal"
            />
          ) : null}
          <EntityManager
            rows={sites}
            getId={(s) => s.id}
            getName={(s) => s.name}
            singular="site"
            label="Sites"
            columns={siteColumns}
            initialSort={{ columnId: "name", direction: "asc" }}
            readOnly={!canEdit}
            renderCard={(s, actions) => (
              <div className="flex flex-col gap-2">
                <EntityCard
                  title={<SiteLink s={s} />}
                  badges={<FreshnessBadge freshness={freshness.get(s.id)!} />}
                  lines={[s.postcode + (s.latitude === null ? " · no pin" : "")]}
                  actions={actions}
                />
                <RestrictionChips site={s} />
              </div>
            )}
            renderFields={(row) => (
              <SiteFields
                row={row}
                customerId={customer.id}
                defaultInstructions={customer.default_delivery_instructions}
              />
            )}
            save={saveSite}
            remove={deleteSite}
            onSaved={(state) => {
              if ((state as SiteSaveState).located === false) {
                toast.info("We couldn't find that postcode on the map", {
                  description: "Open the site to place its pin by hand.",
                });
              }
            }}
            deleteWarning="Its contacts stay with the customer. This can't be undone."
            empty={{
              icon: MapPin,
              title: "No sites yet",
              description:
                "Add each place you deliver to, with its access, unloading and booking rules.",
            }}
          />
        </TabsContent>

        <TabsContent value="contacts">
          <EntityManager
            rows={contacts}
            getId={(c) => c.id}
            getName={(c) => c.name}
            singular="contact"
            label="Contacts"
            columns={contactColumns}
            initialSort={{ columnId: "name", direction: "asc" }}
            readOnly={!canEdit}
            renderCard={(c, actions) => (
              <EntityCard
                title={c.name}
                lines={[
                  c.job_role,
                  c.phone ? (
                    <a
                      key="p"
                      href={`tel:${c.phone.replace(/\s/g, "")}`}
                      className="num text-accent-text"
                    >
                      {c.phone}
                    </a>
                  ) : null,
                  c.email,
                  siteName(c.site_id),
                ]}
                actions={actions}
              />
            )}
            renderFields={(row) => (
              <ContactFields row={row} customerId={customer.id} sites={sites} />
            )}
            save={saveContact}
            remove={deleteContact}
            empty={{
              icon: ContactIcon,
              title: "No contacts yet",
              description:
                "Add the people you speak to about deliveries: goods-in, site managers, buyers.",
            }}
          />
        </TabsContent>

        <TabsContent value="orders">
          <CustomerOrders
            orders={orders.rows}
            total={orders.total}
            search={customer.account_ref || customer.name}
            canSeeOrders={orders.canSee}
            canEditOrders={orders.canEdit}
          />
        </TabsContent>

        <TabsContent value="assets">
          {assets.length ? (
            <Card className="flex min-w-0 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-muted">
                  <span className="num">{plural(assets.length, "asset")}</span> at their sites
                  {assets.some((a) => a.daysOverdue > 0)
                    ? ` · ${assets.filter((a) => a.daysOverdue > 0).length} overdue`
                    : ""}
                </p>
                {canSeeAssets ? (
                  <Button asChild size="sm">
                    <Link href={`/history/assets?customer=${customer.id}`}>Open in Assets</Link>
                  </Button>
                ) : null}
              </div>
              <ul
                aria-label="Assets at this customer"
                className="flex flex-col divide-y divide-border"
              >
                {assets.map((a) => (
                  <li
                    key={a.id}
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  >
                    <span className="text-sm font-medium">{a.assetNumber}</span>
                    <span className="text-sm text-text-muted">{a.unitTypeName}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.where.split(" · ").slice(1).join(" · ")}
                    </span>
                    {a.expectedReturn ? (
                      <span className="num text-xs text-text-muted">
                        Due back {formatIsoDate(a.expectedReturn)}
                      </span>
                    ) : null}
                    <AssetStatusBadge status={a.status} daysOverdue={a.daysOverdue} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={Boxes}
                title="No returnable assets on site"
                description="Stillages, A-frames and cages left at this customer's sites are tracked here once they're delivered."
              />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="flex flex-col gap-6">
              <NoteBlock
                title="Default delivery instructions"
                text={customer.default_delivery_instructions}
              />
              <NoteBlock title="Notes" text={customer.notes} />
              {canEdit ? (
                <Button className="self-start" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  Edit notes
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SidePanel
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ${customer.name}`}
        footer={
          <>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" form="customer-form" variant="primary" loading={saving}>
              Save customer
            </Button>
          </>
        }
      >
        {editing ? (
          <EntityForm
            id="customer-form"
            action={(fd) => saveCustomer(customer.id, fd)}
            onPendingChange={setSaving}
            onSaved={() => {
              toast.success("Customer saved");
              setEditing(false);
              router.refresh();
            }}
          >
            <CustomerFields row={customer} />
          </EntityForm>
        ) : null}
      </SidePanel>

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${customer.name}?`}
        description="Their sites and contacts will be deleted too. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteCustomer(customer.id);
                  if (result.ok) {
                    toast.success(`${customer.name} deleted`);
                    router.push("/customers");
                  } else {
                    setConfirmDelete(false);
                    toast.error(result.error);
                  }
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );
}

function NoteBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {text ? (
        <p className="text-sm whitespace-pre-line text-text-muted">{text}</p>
      ) : (
        <p className="text-sm text-text-subtle">None recorded.</p>
      )}
    </div>
  );
}

function ContactFields({
  row,
  customerId,
  sites,
}: {
  row: Contact | null;
  customerId: string;
  sites: Site[];
}) {
  return (
    <FormSection title="Contact">
      <input type="hidden" name="customer_id" value={customerId} />
      <FormField name="name" label="Name" required>
        <Input name="name" defaultValue={row?.name} autoComplete="off" />
      </FormField>
      <FormField name="job_role" label="Role" hint="e.g. Goods-in, site manager, buyer.">
        <Input name="job_role" defaultValue={row?.job_role} />
      </FormField>
      <FieldRow>
        <FormField name="phone" label="Phone">
          <Input name="phone" type="tel" defaultValue={row?.phone} className="num" />
        </FormField>
        <FormField name="email" label="Email">
          <Input name="email" type="email" defaultValue={row?.email} />
        </FormField>
      </FieldRow>
      <FormField
        name="site_id"
        label="Site"
        hint="Leave as “All sites” if they cover the whole customer."
      >
        <Select
          name="site_id"
          options={[
            { value: "none", label: "All sites" },
            ...sites.map((s) => ({ value: s.id, label: s.name })),
          ]}
          defaultValue={row?.site_id ?? "none"}
        />
      </FormField>
    </FormSection>
  );
}
