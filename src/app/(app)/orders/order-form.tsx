"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EntityForm,
  FieldRow,
  FormField,
  FormSection,
  useFormErrors,
} from "@/components/settings/entity-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatKg, fromIsoDate } from "@/lib/format";
import { READINESS, URGENCY } from "@/lib/orders/options";
import type { OrderRow } from "@/lib/orders/types";
import { saveOrder } from "./actions";

export type CustomerOption = { id: string; name: string; account_ref: string };
export type SiteOption = {
  id: string;
  customer_id: string;
  name: string;
  postcode: string;
  delivery_instructions: string;
};
export type UnitOption = {
  id: string;
  name: string;
  short_code: string;
  typical_weight_kg: number;
};

type LineState = {
  key: number;
  unit_type_id: string;
  quantity: string;
  weight: string;
  description: string;
};

let nextKey = 1;
const blankLine = (): LineState => ({
  key: nextKey++,
  unit_type_id: "",
  quantity: "",
  weight: "",
  description: "",
});

function LinesEditor({
  lines,
  setLines,
  unitTypes,
}: {
  lines: LineState[];
  setLines: (l: LineState[]) => void;
  unitTypes: UnitOption[];
}) {
  const { errors } = useFormErrors();
  const update = (key: number, patch: Partial<LineState>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.weight) || 0),
    0,
  );

  if (!unitTypes.length) {
    return (
      <p className="text-sm text-text-muted">
        Add your{" "}
        <Link
          href="/settings/unit-types"
          className="font-medium text-accent-text underline underline-offset-2"
        >
          handling unit types
        </Link>{" "}
        first (an admin can do this in Settings).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {errors.lines ? (
        <p role="alert" className="text-sm text-danger-fg">
          {errors.lines}
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const n = index;
          const err = (f: string) => errors[`line_${n}_${f}`];
          return (
            <li
              key={line.key}
              className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Line {index + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="grid min-w-0 gap-3 md:grid-cols-4">
                <FormField
                  name={`line_${n}_unit_type_id`}
                  label="Unit type"
                  className="md:col-span-2"
                >
                  <Select
                    name={`line_${n}_unit_type_id`}
                    options={unitTypes.map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.short_code})`,
                    }))}
                    value={line.unit_type_id || undefined}
                    placeholder="Choose…"
                    invalid={Boolean(err("unit_type_id"))}
                    onValueChange={(v) => {
                      const unit = unitTypes.find((u) => u.id === v);
                      update(line.key, {
                        unit_type_id: v,
                        weight: line.weight || (unit ? String(unit.typical_weight_kg) : ""),
                      });
                    }}
                  />
                </FormField>
                <FormField name={`line_${n}_quantity`} label="Quantity">
                  <Input
                    name={`line_${n}_quantity`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    className="num"
                  />
                </FormField>
                <FormField name={`line_${n}_weight_per_unit_kg`} label="Weight per unit">
                  <Input
                    name={`line_${n}_weight_per_unit_kg`}
                    inputMode="decimal"
                    value={line.weight}
                    onChange={(e) => update(line.key, { weight: e.target.value })}
                    trailing="kg"
                    className="num"
                  />
                </FormField>
              </div>
              <FormField name={`line_${n}_description`} label="Description">
                <Input
                  name={`line_${n}_description`}
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                  placeholder="e.g. Oak front doors, 838 × 1981"
                />
              </FormField>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => setLines([...lines, blankLine()])}>
          <Plus aria-hidden />
          Add line
        </Button>
        <p className="text-sm text-text-muted">
          Total weight{" "}
          <span className="num font-medium text-text">{formatKg(Math.round(total))}</span>
        </p>
      </div>
    </div>
  );
}

export function OrderForm({
  order,
  customers,
  sites,
  unitTypes,
}: {
  order: OrderRow | null;
  customers: CustomerOption[];
  sites: SiteOption[];
  unitTypes: UnitOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(order?.customer_id ?? null);
  const customerSites = sites.filter((s) => s.customer_id === customerId);
  const [siteId, setSiteId] = useState<string | null>(order?.site_id ?? null);
  const [instructions, setInstructions] = useState(order?.delivery_instructions ?? "");
  const [instructionsEdited, setInstructionsEdited] = useState(Boolean(order));
  const [readiness, setReadiness] = useState<string>(order?.readiness ?? "not_started");
  const [lines, setLines] = useState<LineState[]>(() =>
    order?.lines.length
      ? [...order.lines]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((l) => ({
            key: nextKey++,
            unit_type_id: l.unit_type_id,
            quantity: String(l.quantity),
            weight: String(Number(l.weight_per_unit_kg)),
            description: l.description,
          }))
      : [blankLine()],
  );

  function chooseSite(id: string | null) {
    setSiteId(id);
    // Instructions are pre-filled from the site until someone edits them (spec 6.7).
    const site = sites.find((s) => s.id === id);
    if (site && !instructionsEdited) setInstructions(site.delivery_instructions);
  }

  const date = (iso: string | null | undefined) => (iso ? fromIsoDate(iso) : null);
  const showReadyFields = readiness !== "ready";

  return (
    <EntityForm
      id="order-form"
      action={(fd) => saveOrder(order?.id ?? null, fd)}
      onPendingChange={setSaving}
      onSaved={(state) => {
        toast.success(order ? "Order saved" : "Order created");
        router.push(`/orders/${state.id}`);
        router.refresh();
      }}
      className="flex max-w-panel flex-col gap-6 xl:max-w-content"
    >
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-6">
            <FormSection title="Customer and site">
              <FormField name="customer_id" label="Customer" required>
                <Combobox
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.account_ref || undefined,
                    keywords: [c.account_ref],
                  }))}
                  value={customerId}
                  onValueChange={(v) => {
                    setCustomerId(v);
                    const own = sites.filter((s) => s.customer_id === v);
                    chooseSite(own.length === 1 ? own[0].id : null);
                  }}
                  placeholder="Choose a customer"
                  searchPlaceholder="Search name or account ref"
                />
              </FormField>
              <input type="hidden" name="customer_id" value={customerId ?? ""} />
              <FormField
                name="site_id"
                label="Delivery site"
                required
                hint={
                  customerId && !customerSites.length
                    ? "This customer has no sites yet."
                    : undefined
                }
              >
                <Select
                  key={customerId ?? "none"}
                  name="site_id"
                  options={customerSites.map((s) => ({
                    value: s.id,
                    label: `${s.name} · ${s.postcode}`,
                  }))}
                  value={siteId ?? undefined}
                  onValueChange={chooseSite}
                  placeholder={customerId ? "Choose a site" : "Choose a customer first"}
                  disabled={!customerSites.length}
                />
              </FormField>
            </FormSection>
            <FormSection title="References">
              <FieldRow>
                <FormField name="order_ref" label="Order ref" required>
                  <Input name="order_ref" defaultValue={order?.order_ref} autoComplete="off" />
                </FormField>
                <FormField name="customer_po" label="Customer PO number">
                  <Input name="customer_po" defaultValue={order?.customer_po} autoComplete="off" />
                </FormField>
                <FormField name="delivery_note_number" label="Delivery note number">
                  <Input
                    name="delivery_note_number"
                    defaultValue={order?.delivery_note_number}
                    autoComplete="off"
                  />
                </FormField>
                <FormField name="invoice_number" label="Invoice number">
                  <Input
                    name="invoice_number"
                    defaultValue={order?.invoice_number}
                    autoComplete="off"
                  />
                </FormField>
              </FieldRow>
            </FormSection>
            <FormSection title="Dates">
              <FieldRow>
                <FormField name="required_date" label="Required delivery date" required>
                  <DatePicker name="required_date" defaultValue={date(order?.required_date)} />
                </FormField>
                <FormField name="urgency" label="Urgency">
                  <Select
                    name="urgency"
                    options={[...URGENCY]}
                    defaultValue={order?.urgency ?? "standard"}
                  />
                </FormField>
                <FormField name="earliest_date" label="Earliest date" hint="If it can go early.">
                  <DatePicker name="earliest_date" defaultValue={date(order?.earliest_date)} />
                </FormField>
                <FormField name="latest_date" label="Latest date" hint="If it can go late.">
                  <DatePicker name="latest_date" defaultValue={date(order?.latest_date)} />
                </FormField>
              </FieldRow>
            </FormSection>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent>
              <FormSection title="What's being delivered">
                <LinesEditor lines={lines} setLines={setLines} unitTypes={unitTypes} />
              </FormSection>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-6">
              <FormSection title="Readiness">
                <FieldRow>
                  <FormField name="readiness" label="Readiness">
                    <Select
                      name="readiness"
                      options={[...READINESS]}
                      value={readiness}
                      onValueChange={setReadiness}
                    />
                  </FormField>
                  {showReadyFields ? (
                    <FormField name="expected_ready_date" label="Expected ready date">
                      <DatePicker
                        name="expected_ready_date"
                        defaultValue={date(order?.expected_ready_date)}
                      />
                    </FormField>
                  ) : null}
                </FieldRow>
                {showReadyFields ? (
                  <FormField
                    name="missing_items"
                    label="Missing items"
                    hint="What's still to come, e.g. “2 door frames”."
                  >
                    <Input name="missing_items" defaultValue={order?.missing_items} />
                  </FormField>
                ) : null}
              </FormSection>
              <FormSection title="Instructions and notes">
                <FormField
                  name="delivery_instructions"
                  label="Delivery instructions"
                  hint="Pre-filled from the site; change them for this order if needed."
                >
                  <Textarea
                    name="delivery_instructions"
                    value={instructions}
                    onChange={(e) => {
                      setInstructions(e.target.value);
                      setInstructionsEdited(true);
                    }}
                  />
                </FormField>
                <FormField name="notes" label="Notes">
                  <Textarea name="notes" defaultValue={order?.notes} />
                </FormField>
              </FormSection>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button asChild>
          <Link href={order ? `/orders/${order.id}` : "/orders"}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {order ? "Save order" : "Create order"}
        </Button>
      </div>
    </EntityForm>
  );
}
