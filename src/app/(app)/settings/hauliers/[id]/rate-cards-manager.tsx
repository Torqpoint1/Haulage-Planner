"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { FieldRow, FormField, FormSection, useFormErrors } from "@/components/settings/entity-form";
import { EntityCard, EntityManager } from "@/components/settings/entity-manager";
import { ColourDot } from "@/components/settings/inputs";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Input, Textarea } from "@/components/ui/input";
import type { Column } from "@/components/ui/table";
import { formatGbp, formatLocalDate, fromIsoDate } from "@/lib/format";
import { LOAD_TYPES, PALLET_SIZES } from "@/lib/settings/options";
import { deleteRateCard, saveRateCard } from "../actions";

export type ZoneOption = { id: string; name: string; colour_tag: string; postcode_areas: string[] };

export type RateCard = {
  id: string;
  name: string;
  valid_from: string;
  valid_to: string | null;
  per_drop: number;
  extra_drop: number;
  surcharge_tail_lift_per_pallet: number;
  surcharge_timed: number;
  surcharge_remote_area: number;
  remote_postcodes: string[];
  surcharge_two_person: number;
  waiting_per_hour: number;
  waiting_free_minutes: number;
  notes: string;
  pallet_prices: { zone_id: string; pallet_size: string; price: number }[];
  load_prices: { zone_id: string; load_type: string; price: number }[];
};

const date = (iso: string) => formatLocalDate(fromIsoDate(iso));

export function rateCardStatus(card: Pick<RateCard, "valid_from" | "valid_to">, today: string) {
  if (card.valid_from > today)
    return { tone: "info" as const, label: `Starts ${date(card.valid_from)}` };
  if (card.valid_to && card.valid_to < today) return { tone: "neutral" as const, label: "Expired" };
  return { tone: "success" as const, label: "Current" };
}

const validity = (c: RateCard) =>
  `${date(c.valid_from)} – ${c.valid_to ? date(c.valid_to) : "no end date"}`;

const zonesPriced = (c: RateCard) =>
  new Set([...c.pallet_prices, ...c.load_prices].map((p) => p.zone_id)).size;

function MoneyField({
  name,
  label,
  value,
  hint,
}: {
  name: string;
  label: string;
  value?: number;
  hint?: string;
}) {
  return (
    <FormField name={name} label={label} hint={hint}>
      <Input
        name={name}
        inputMode="decimal"
        defaultValue={Number(value ?? 0).toFixed(2)}
        leadingIcon={<span className="text-sm">£</span>}
        className="num"
      />
    </FormField>
  );
}

function PriceGrid({ card, zones }: { card: RateCard | null; zones: ZoneOption[] }) {
  const { errors } = useFormErrors();
  if (!zones.length) {
    return (
      <p className="text-sm text-text-muted">
        Set up your{" "}
        <Link
          href="/settings/zones"
          className="font-medium text-accent-text underline underline-offset-2"
        >
          postcode zones
        </Link>{" "}
        first, then add prices for each zone here.
      </p>
    );
  }
  const price = (kind: "pallet" | "load", zone: string, option: string) => {
    const list = kind === "pallet" ? card?.pallet_prices : card?.load_prices;
    const hit = list?.find(
      (p) => p.zone_id === zone && ("pallet_size" in p ? p.pallet_size : p.load_type) === option,
    );
    return hit ? Number(hit.price).toFixed(2) : "";
  };
  return (
    <div className="flex flex-col gap-4">
      {zones.map((z) => {
        const zoneErrors = Object.entries(errors).filter(([k]) => k.includes(z.id));
        return (
          <fieldset key={z.id} className="min-w-0 rounded-md border border-border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-medium">
              <ColourDot tag={z.colour_tag} />
              {z.name}
              <span className="font-normal text-text-subtle">{z.postcode_areas.join(", ")}</span>
            </legend>
            <p className="mb-2 text-xs font-medium text-text-subtle">Per pallet</p>
            <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">
              {PALLET_SIZES.map((s) => (
                <PriceInput
                  key={s.value}
                  name={`pallet_${z.id}_${s.value}`}
                  label={s.label}
                  ariaLabel={`${s.label} pallet`}
                  zone={z.name}
                  defaultValue={price("pallet", z.id, s.value)}
                  invalid={Boolean(errors[`pallet_${z.id}_${s.value}`])}
                />
              ))}
            </div>
            <p className="mt-3 mb-2 text-xs font-medium text-text-subtle">Per load</p>
            <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">
              {LOAD_TYPES.map((t) => (
                <PriceInput
                  key={t.value}
                  name={`load_${z.id}_${t.value}`}
                  label={t.label}
                  ariaLabel={t.label}
                  zone={z.name}
                  defaultValue={price("load", z.id, t.value)}
                  invalid={Boolean(errors[`load_${z.id}_${t.value}`])}
                />
              ))}
            </div>
            {zoneErrors.length ? (
              <p role="alert" className="mt-2 text-sm text-danger-fg">
                {zoneErrors[0][1]}
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

function PriceInput({
  name,
  label,
  ariaLabel,
  zone,
  defaultValue,
  invalid,
}: {
  name: string;
  label: string;
  ariaLabel: string;
  zone: string;
  defaultValue: string;
  invalid: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-xs font-medium text-text-muted">{label}</span>
      <Input
        name={name}
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder="–"
        aria-label={`${zone}: ${ariaLabel}`}
        leadingIcon={<span className="text-sm">£</span>}
        invalid={invalid}
        className="num"
      />
    </label>
  );
}

function Fields({
  row,
  zones,
  haulierId,
}: {
  row: RateCard | null;
  zones: ZoneOption[];
  haulierId: string;
}) {
  const c = row;
  return (
    <>
      <FormSection title="Rate card">
        <input type="hidden" name="haulier_id" value={haulierId} />
        <FormField name="name" label="Name" required>
          <Input name="name" defaultValue={c?.name} placeholder="e.g. 2026 tariff" />
        </FormField>
        <FieldRow>
          <FormField name="valid_from" label="Valid from" required>
            <DatePicker name="valid_from" defaultValue={c ? fromIsoDate(c.valid_from) : null} />
          </FormField>
          <FormField name="valid_to" label="Valid to" hint="Leave blank if open-ended.">
            <DatePicker
              name="valid_to"
              defaultValue={c?.valid_to ? fromIsoDate(c.valid_to) : null}
            />
          </FormField>
        </FieldRow>
      </FormSection>
      <FormSection
        title="Prices by zone"
        description="Leave a price blank if they don't offer it in that zone."
      >
        <PriceGrid card={c} zones={zones} />
      </FormSection>
      <FormSection title="Drop charges">
        <FieldRow>
          <MoneyField name="per_drop" label="Per drop" value={c?.per_drop} />
          <MoneyField name="extra_drop" label="Each extra drop" value={c?.extra_drop} />
        </FieldRow>
      </FormSection>
      <FormSection title="Surcharges">
        <FieldRow>
          <MoneyField
            name="surcharge_tail_lift_per_pallet"
            label="Tail lift, per pallet"
            value={c?.surcharge_tail_lift_per_pallet}
          />
          <MoneyField name="surcharge_timed" label="Timed delivery" value={c?.surcharge_timed} />
          <MoneyField
            name="surcharge_two_person"
            label="Two-person delivery"
            value={c?.surcharge_two_person}
          />
          <MoneyField
            name="surcharge_remote_area"
            label="Remote area"
            value={c?.surcharge_remote_area}
          />
        </FieldRow>
        <FormField
          name="remote_postcodes"
          label="Remote area postcodes"
          hint="Areas or districts, e.g. IV, PA20, ZE."
        >
          <Input
            name="remote_postcodes"
            defaultValue={c?.remote_postcodes.join(", ")}
            className="uppercase"
          />
        </FormField>
        <FieldRow>
          <MoneyField
            name="waiting_per_hour"
            label="Waiting time, per hour"
            value={c?.waiting_per_hour}
          />
          <FormField name="waiting_free_minutes" label="Free waiting time">
            <Input
              name="waiting_free_minutes"
              inputMode="numeric"
              defaultValue={c?.waiting_free_minutes ?? 0}
              trailing="min"
              className="num"
            />
          </FormField>
        </FieldRow>
      </FormSection>
      <FormSection title="Notes">
        <FormField name="notes" label="Notes">
          <Textarea name="notes" defaultValue={c?.notes} />
        </FormField>
      </FormSection>
    </>
  );
}

export function RateCardsManager({
  haulierId,
  rows,
  zones,
  today,
}: {
  haulierId: string;
  rows: RateCard[];
  zones: ZoneOption[];
  today: string;
}) {
  const status = (c: RateCard) => {
    const s = rateCardStatus(c, today);
    return <Badge tone={s.tone}>{s.label}</Badge>;
  };
  const columns: Column<RateCard>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortValue: (c) => c.name,
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    { id: "valid", header: "Valid", sortValue: (c) => c.valid_from, cell: validity },
    { id: "status", header: "Status", cell: status },
    {
      id: "drop",
      header: "Per drop",
      align: "right",
      sortValue: (c) => c.per_drop,
      cell: (c) => formatGbp(c.per_drop),
    },
    {
      id: "zones",
      header: "Zones priced",
      align: "right",
      cell: (c) => `${zonesPriced(c)} of ${zones.length}`,
    },
  ];
  return (
    <EntityManager
      rows={rows}
      getId={(c) => c.id}
      getName={(c) => c.name}
      singular="rate card"
      label="Rate cards"
      columns={columns}
      initialSort={{ columnId: "valid", direction: "desc" }}
      renderCard={(c, actions) => (
        <EntityCard
          title={c.name}
          badges={status(c)}
          lines={[
            validity(c),
            `${formatGbp(c.per_drop)} per drop · ${zonesPriced(c)} of ${zones.length} zones priced`,
          ]}
          actions={actions}
        />
      )}
      renderFields={(row) => <Fields row={row} zones={zones} haulierId={haulierId} />}
      save={saveRateCard}
      remove={deleteRateCard}
      empty={{
        icon: Receipt,
        title: "No rate cards yet",
        description:
          "Add this haulier's prices so they can be compared with your own vehicles and other hauliers.",
      }}
    />
  );
}
