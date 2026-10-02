"use client";

import {
  CircleCheck,
  LocateFixed,
  MapPinOff,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FreshnessBadge, RestrictionChips } from "@/components/customers/site-badges";
import { MapPanel } from "@/components/map/map-panel";
import { EntityForm } from "@/components/settings/entity-form";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { toast } from "@/components/ui/toast";
import { siteFreshness } from "@/lib/customers/sites";
import { SITE_EQUIPMENT } from "@/lib/customers/options";
import type { Contact, Customer, Site } from "@/lib/customers/types";
import { formatKg, formatMetres } from "@/lib/format";
import { summariseHours } from "@/lib/settings/hours";
import { VEHICLE_TYPES, labelFor } from "@/lib/settings/options";
import {
  deleteSite,
  saveSite,
  setSitePosition,
  verifySite,
  type SiteSaveState,
} from "../../../actions";
import { SiteFields } from "../../site-fields";

type Props = {
  site: Site;
  customer: Customer;
  contacts: Contact[];
  verifiedByName: string | null;
  staleDays: number;
  canEdit: boolean;
};

const yes = (v: boolean) => (v ? "Yes" : "No");

function Details({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-sm text-text-muted">{label}</dt>
          <dd className="min-w-0 text-sm break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SiteView({ site, customer, contacts, verifiedByName, staleDays, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  // A pin position the person has moved but not saved yet.
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [pinVersion, setPinVersion] = useState(0);
  const [coordsOpen, setCoordsOpen] = useState(false);

  const freshness = siteFreshness(site.last_verified_at, staleDays);
  const located = site.latitude !== null && site.longitude !== null;
  const position = draft ?? (located ? { lat: site.latitude!, lng: site.longitude! } : null);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    after?: () => void,
  ) {
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else toast.error(result.error ?? "Something went wrong. Try again.");
    });
  }

  const none = <span className="text-text-subtle">None</span>;
  const equipment = site.site_equipment.length
    ? site.site_equipment.map((e) => labelFor([...SITE_EQUIPMENT], e)).join(", ")
    : "Nothing";

  return (
    <>
      <SettingsHeader
        title={site.name}
        description={[site.address.replace(/\n/g, ", "), site.postcode].filter(Boolean).join(", ")}
        backHref={`/customers/${customer.id}`}
        backLabel={customer.name}
        actions={
          canEdit ? (
            <>
              <Button onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit site
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <FreshnessBadge freshness={freshness} />
              {verifiedByName && site.last_verified_at ? (
                <span className="text-sm text-text-muted">by {verifiedByName}</span>
              ) : null}
            </div>
            <p className="text-sm text-text-muted">
              {freshness.stale
                ? "Check these details with the customer, then mark them as verified."
                : `Details are checked again after ${staleDays} days.`}
            </p>
          </div>
          {canEdit ? (
            <Button
              variant={freshness.stale ? "primary" : "secondary"}
              loading={pending}
              onClick={() => run(() => verifySite(site.id), "Site marked as verified")}
            >
              <CircleCheck aria-hidden />
              Mark as verified
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section aria-label="Restrictions summary" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">At a glance</h2>
        <RestrictionChips site={site} />
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Access">
            <Details
              rows={[
                [
                  "Largest vehicle",
                  site.max_vehicle_type
                    ? labelFor(VEHICLE_TYPES, site.max_vehicle_type)
                    : "No limit",
                ],
                [
                  "Maximum length",
                  site.max_length_m ? formatMetres(site.max_length_m) : "No limit",
                ],
                ["Maximum weight", site.max_weight_kg ? formatKg(site.max_weight_kg) : "No limit"],
                [
                  "Height restriction",
                  site.height_limit_m ? formatMetres(site.height_limit_m) : "None",
                ],
                ["HGVs allowed", yes(!site.no_hgvs)],
                ["Narrow access", site.narrow_access_note || none],
                ["Parking", site.parking_note || none],
              ]}
            />
          </Section>
          <Section title="Unloading">
            <Details
              rows={[
                ["Equipment on site", equipment],
                [
                  "Handballing",
                  site.handball_allowed
                    ? `Allowed${site.handball_people ? `, ${site.handball_people} ${site.handball_people === 1 ? "person" : "people"}` : ""}`
                    : "Not allowed",
                ],
                ["Crane drop", site.crane_drop_allowed ? "Allowed" : "Not allowed"],
              ]}
            />
          </Section>
          <Section title="Booking and hours">
            <Details
              rows={[
                [
                  "Booking",
                  site.booking_required
                    ? `Required${site.booking_lead_hours ? `, ${site.booking_lead_hours} hours' notice` : ""}`
                    : "Not required",
                ],
                ["How to book", site.how_to_book || none],
                ["Opening hours", summariseHours(site.opening_hours)],
                [
                  "Delivery windows",
                  Object.values(site.delivery_windows).some(Boolean)
                    ? summariseHours(site.delivery_windows)
                    : "Any time it's open",
                ],
              ]}
            />
          </Section>
          <Section title="Site rules">
            <Details
              rows={[
                ["PPE", site.ppe_required ? "Required" : "Not required"],
                ["Induction", site.induction_required ? "Required" : "Not required"],
                [
                  "Site contact present",
                  site.contact_must_be_present ? "Must be present" : "Not needed",
                ],
              ]}
            />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <MapPanel
              title="Location"
              pins={
                !canEdit && position
                  ? [
                      {
                        id: site.id,
                        lat: position.lat,
                        lng: position.lng,
                        label: site.name,
                        colour: "load-1",
                      },
                    ]
                  : []
              }
              editable={
                canEdit && position
                  ? {
                      lat: position.lat,
                      lng: position.lng,
                      label: `${site.name} location`,
                      version: pinVersion,
                      onMove: (lat, lng) => setDraft({ lat, lng }),
                    }
                  : null
              }
              emptyMessage={
                canEdit
                  ? "No position yet. Enter coordinates below."
                  : "We couldn't find this postcode on the map."
              }
              className="h-modal"
            />
            {!located && !draft ? (
              <p className="flex items-start gap-2 text-sm text-text-muted">
                <MapPinOff className="mt-px size-icon-sm shrink-0" aria-hidden />
                We couldn&apos;t find {site.postcode} on the map, so this site has no pin yet.
              </p>
            ) : null}
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                {draft ? (
                  <>
                    <Button
                      variant="primary"
                      loading={pending}
                      onClick={() =>
                        run(
                          () =>
                            setSitePosition(site.id, { latitude: draft.lat, longitude: draft.lng }),
                          "Pin position saved",
                          () => setDraft(null),
                        )
                      }
                    >
                      Save pin position
                    </Button>
                    <Button
                      onClick={() => {
                        setDraft(null);
                        setPinVersion((v) => v + 1);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">
                    {site.location_source === "manual"
                      ? "Pin placed by hand."
                      : located
                        ? "Pin placed from the postcode. Drag it, or click the map, to correct it."
                        : null}
                  </p>
                )}
                <Button variant="ghost" onClick={() => setCoordsOpen(true)}>
                  <LocateFixed aria-hidden />
                  Enter coordinates
                </Button>
                {site.location_source === "manual" ? (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setSitePosition(site.id, null),
                        "Pin reset to the postcode",
                        () => {
                          setDraft(null);
                          setPinVersion((v) => v + 1);
                        },
                      )
                    }
                  >
                    <RotateCcw aria-hidden />
                    Reset to postcode
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <Section title="Contacts">
            {contacts.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {contacts.map((c) => (
                  <li
                    key={c.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-sm text-text-muted">
                        {[c.job_role, c.site_id ? null : "All sites"].filter(Boolean).join(" · ") ||
                          "Contact"}
                      </span>
                    </span>
                    {c.phone ? (
                      <Button asChild size="sm">
                        <a href={`tel:${c.phone.replace(/\s/g, "")}`}>
                          <Phone aria-hidden />
                          <span className="num">{c.phone}</span>
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                No contacts for this site. Add them on the customer&apos;s Contacts tab.
              </p>
            )}
          </Section>

          <Section title="Instructions and notes">
            <Details
              rows={[
                [
                  "Delivery instructions",
                  site.delivery_instructions ? (
                    <span className="whitespace-pre-line">{site.delivery_instructions}</span>
                  ) : (
                    none
                  ),
                ],
                [
                  "Notes",
                  site.notes ? <span className="whitespace-pre-line">{site.notes}</span> : none,
                ],
              ]}
            />
          </Section>
        </div>
      </div>

      <SidePanel
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ${site.name}`}
        footer={
          <>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" form="site-form" variant="primary" loading={saving}>
              Save site
            </Button>
          </>
        }
      >
        {editing ? (
          <EntityForm
            id="site-form"
            action={(fd) => saveSite(site.id, fd)}
            onPendingChange={setSaving}
            onSaved={(state) => {
              toast.success("Site saved");
              if ((state as SiteSaveState).located === false) {
                toast.info("We couldn't find that postcode on the map", {
                  description: "Enter the coordinates to place the pin by hand.",
                });
              }
              setEditing(false);
              setPinVersion((v) => v + 1);
              router.refresh();
            }}
          >
            <SiteFields
              row={site}
              customerId={customer.id}
              defaultInstructions={customer.default_delivery_instructions}
            />
          </EntityForm>
        ) : null}
      </SidePanel>

      <CoordinatesModal
        open={coordsOpen}
        onOpenChange={setCoordsOpen}
        initial={position}
        onSubmit={(lat, lng) =>
          run(
            () => setSitePosition(site.id, { latitude: lat, longitude: lng }),
            "Pin position saved",
            () => {
              setCoordsOpen(false);
              setDraft(null);
              setPinVersion((v) => v + 1);
            },
          )
        }
        pending={pending}
      />

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${site.name}?`}
        description="Its contacts stay with the customer. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const result = await deleteSite(site.id);
                  if (result.ok) {
                    toast.success(`${site.name} deleted`);
                    router.push(`/customers/${customer.id}`);
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

/** The non-drag way to place a pin (spec 10.9). */
function CoordinatesModal({
  open,
  onOpenChange,
  initial,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { lat: number; lng: number } | null;
  onSubmit: (lat: number, lng: number) => void;
  pending: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setError(null);
      }}
      title="Enter coordinates"
      description="Use latitude and longitude in decimal degrees, e.g. from a mapping app."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const lat = Number(fd.get("latitude"));
          const lng = Number(fd.get("longitude"));
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < 49 ||
            lat > 61 ||
            lng < -9 ||
            lng > 3
          ) {
            setError(
              "Enter a UK position: latitude between 49 and 61, longitude between -9 and 3.",
            );
            return;
          }
          onSubmit(lat, lng);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Latitude" error={error ?? undefined}>
            <Input
              name="latitude"
              inputMode="decimal"
              defaultValue={initial?.lat.toFixed(5) ?? ""}
              className="num"
            />
          </Field>
          <Field label="Longitude">
            <Input
              name="longitude"
              inputMode="decimal"
              defaultValue={initial?.lng.toFixed(5) ?? ""}
              className="num"
            />
          </Field>
        </div>
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>
            Place pin
          </Button>
        </div>
      </form>
    </Modal>
  );
}
