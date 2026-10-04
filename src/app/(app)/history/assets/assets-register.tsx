"use client";

import { Boxes, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EntityCard } from "@/components/settings/entity-manager";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PanelSection, SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { matchesSearch } from "@/components/ui/combobox";
import type { AssetMovement, AssetRegister, AssetRow } from "@/lib/assets/data";
import { AssetStatusBadge } from "@/components/assets/asset-status";
import { ASSET_STATUSES } from "@/lib/assets/options";
import { formatDateTime, formatIsoDate, fromIsoDate, plural, toIsoDate } from "@/lib/format";
import { addAssets, assetMovementsAction, moveAsset, updateAsset } from "./actions";

const StatusBadge = ({ row }: { row: Pick<AssetRow, "status" | "daysOverdue"> }) => (
  <AssetStatusBadge status={row.status} daysOverdue={row.daysOverdue} />
);

const dueText = (row: AssetRow) =>
  row.expectedReturn
    ? formatIsoDate(row.expectedReturn)
    : row.status === "at_customer"
      ? "No date"
      : "";

function Movements({ assetId }: { assetId: string }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; list: AssetMovement[] } | { kind: "error" }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    assetMovementsAction(assetId)
      .then(
        (r) => live && setState(r.ok ? { kind: "ready", list: r.movements } : { kind: "error" }),
      )
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [assetId, attempt]);
  if (state.kind === "loading")
    return (
      <div className="flex flex-col gap-2" aria-label="Loading movements">
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
      </div>
    );
  if (state.kind === "error")
    return (
      <ErrorState
        compact
        title="Couldn't load where it's been"
        onRetry={() => {
          setState({ kind: "loading" });
          setAttempt((a) => a + 1);
        }}
      />
    );
  return (
    <ol aria-label="Movements" className="flex flex-col gap-3">
      {state.list.map((m) => (
        <li
          key={m.id}
          className="flex min-w-0 flex-col gap-1 border-l-2 border-border pl-3 text-sm"
        >
          <span className="font-medium break-words">
            {m.from === "Added" ? `Added: ${m.to}` : `${m.from} → ${m.to}`}
          </span>
          <span className="text-xs text-text-muted">
            <span className="num">{formatDateTime(m.at)}</span>
            {m.by ? ` · ${m.by}` : ""}
          </span>
          {m.note ? <span className="text-xs break-words">{m.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function AssetPanel({
  row,
  register,
  canManage,
  onClose,
}: {
  row: AssetRow;
  register: AssetRegister;
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState<string>("");
  const [depotId, setDepotId] = useState<string>(register.depots[0]?.id ?? "");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [dueBack, setDueBack] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(row.notes);
  const [due, setDue] = useState<Date | null>(
    row.expectedReturn ? fromIsoDate(row.expectedReturn) : null,
  );
  const onVehicle = row.status === "on_vehicle";

  const save = (work: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    start(async () => {
      const r = await work();
      if (r.ok) {
        toast.success(message);
        router.refresh();
      } else toast.error(r.error ?? "That didn't save. Try again.");
    });

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={row.assetNumber}
      subtitle={row.unitTypeName}
      headerAside={<StatusBadge row={row} />}
    >
      <PanelSection title="Where it is">
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <dt className="font-medium">Now</dt>
          <dd className="break-words">{row.where}</dd>
          {row.droppedOn ? (
            <>
              <dt className="font-medium">Dropped</dt>
              <dd className="num">{formatIsoDate(row.droppedOn)}</dd>
            </>
          ) : null}
          {row.status === "at_customer" ? (
            <>
              <dt className="font-medium">Due back</dt>
              <dd className="num">{dueText(row)}</dd>
            </>
          ) : null}
        </dl>
      </PanelSection>

      {canManage ? (
        <PanelSection title="Record where it is">
          {onVehicle ? (
            <p className="text-sm text-text-muted">
              It&apos;s on a vehicle. It moves when the driver records the stop, or comes back to
              the depot when the load is complete.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="Where is it now?">
                <Select
                  value={to}
                  onValueChange={setTo}
                  placeholder="Choose"
                  options={[
                    { value: "at_depot", label: "Back at a depot" },
                    { value: "at_customer", label: "At a customer site" },
                    { value: "lost", label: "Lost" },
                    { value: "retired", label: "Retired (no longer used)" },
                  ]}
                />
              </Field>
              {to === "at_depot" ? (
                <Field label="Depot">
                  <Select
                    value={depotId}
                    onValueChange={setDepotId}
                    options={register.depots.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Field>
              ) : null}
              {to === "at_customer" ? (
                <>
                  <Field label="Site">
                    <Combobox
                      value={siteId}
                      onValueChange={setSiteId}
                      placeholder="Choose a site"
                      searchPlaceholder="Customer, site or postcode"
                      options={register.sites.map((s) => ({
                        value: s.id,
                        label: `${s.customerName} · ${s.name}`,
                        description: s.postcode,
                        keywords: [s.postcode],
                      }))}
                    />
                  </Field>
                  <Field label="Due back" hint="Optional">
                    <DatePicker value={dueBack} onValueChange={setDueBack} />
                  </Field>
                </>
              ) : null}
              {to ? (
                <>
                  <Field label="Note" hint="Optional, e.g. who told you">
                    <Textarea
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <Button
                    variant="primary"
                    className="w-fit"
                    loading={pending}
                    onClick={() =>
                      save(
                        () =>
                          moveAsset({
                            assetId: row.id,
                            to: to as "at_depot",
                            depotId: to === "at_depot" ? depotId : null,
                            siteId: to === "at_customer" ? siteId : null,
                            dueBack: to === "at_customer" && dueBack ? toIsoDate(dueBack) : null,
                            note,
                          }),
                        `${row.assetNumber} updated`,
                      )
                    }
                  >
                    Save where it is
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </PanelSection>
      ) : null}

      {canManage && row.status === "at_customer" ? (
        <PanelSection title="Due back">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Due back" hideLabel className="min-w-0 flex-1">
              <DatePicker value={due} onValueChange={setDue} />
            </Field>
            <Button
              loading={pending}
              onClick={() =>
                save(
                  () => updateAsset(row.id, { dueBack: due ? toIsoDate(due) : null }),
                  "Due back date saved",
                )
              }
            >
              Save date
            </Button>
          </div>
        </PanelSection>
      ) : null}

      <PanelSection title="Notes">
        {canManage ? (
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label="Notes"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              className="w-fit"
              loading={pending}
              disabled={notes === row.notes}
              onClick={() => save(() => updateAsset(row.id, { notes }), "Notes saved")}
            >
              Save notes
            </Button>
          </div>
        ) : (
          <p className="text-sm break-words whitespace-pre-line">{row.notes || "None."}</p>
        )}
      </PanelSection>

      <PanelSection title="Where it's been">
        <Movements key={`${row.id}:${row.status}:${row.where}`} assetId={row.id} />
      </PanelSection>
    </SidePanel>
  );
}

function AddAssets({
  register,
  open,
  onOpenChange,
}: {
  register: AssetRegister;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [typeId, setTypeId] = useState(register.unitTypes[0]?.id ?? "");
  const [depotId, setDepotId] = useState(register.depots[0]?.id ?? "");
  const [numbers, setNumbers] = useState("");

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Add assets"
      subtitle="Returnable assets start at a depot."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("unit_type_id", typeId);
                fd.set("depot_id", depotId);
                fd.set("numbers", numbers);
                const r = await addAssets(fd);
                if (r.ok) {
                  toast.success("Assets added");
                  setNumbers("");
                  setErrors({});
                  onOpenChange(false);
                  router.refresh();
                } else {
                  setErrors(r.errors ?? {});
                  if (r.error) toast.error(r.error);
                }
              })
            }
          >
            Add assets
          </Button>
        </>
      }
    >
      <PanelSection title="Details">
        {register.unitTypes.length ? (
          <div className="flex flex-col gap-4">
            <Field label="Type" required error={errors.unit_type_id}>
              <Select
                value={typeId}
                onValueChange={setTypeId}
                options={register.unitTypes.map((t) => ({
                  value: t.id,
                  label: t.returnDays ? `${t.name} (back within ${t.returnDays} days)` : t.name,
                }))}
              />
            </Field>
            <Field label="Depot" required error={errors.depot_id}>
              <Select
                value={depotId}
                onValueChange={setDepotId}
                options={register.depots.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
            <Field
              label="Asset numbers"
              required
              hint="One per line, or a range like ST-101 to ST-120."
              error={errors.numbers}
            >
              <Textarea
                rows={5}
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={"ST-101 to ST-120\nAF-7"}
              />
            </Field>
          </div>
        ) : (
          <EmptyState
            compact
            title="No returnable unit types"
            description="Tick “Returnable asset” on a handling unit type in Settings first."
          />
        )}
      </PanelSection>
    </SidePanel>
  );
}

export function AssetsRegister({
  register,
  canManage,
  initialStatus,
  initialCustomer,
}: {
  register: AssetRegister;
  canManage: boolean;
  initialStatus: string;
  initialCustomer: string | null;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [type, setType] = useState("all");
  const [customer, setCustomer] = useState<string | null>(initialCustomer);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of register.assets) {
      if (a.customerId) m.set(a.customerId, a.where.split(" · ")[0]);
    }
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [register.assets]);

  const rows = register.assets.filter((a) => {
    if (q && !matchesSearch(`${a.assetNumber} ${a.unitTypeName} ${a.where}`, q)) return false;
    if (status === "overdue" && a.daysOverdue <= 0) return false;
    if (status !== "all" && status !== "overdue" && a.status !== status) return false;
    if (type !== "all" && a.unitTypeId !== type) return false;
    if (customer && a.customerId !== customer) return false;
    return true;
  });
  const overdue = register.assets.filter((a) => a.daysOverdue > 0).length;
  const out = register.assets.filter((a) => a.status === "at_customer").length;
  const selectedRow = register.assets.find((a) => a.id === selected) ?? null;

  const columns: Column<AssetRow>[] = [
    {
      id: "number",
      header: "Asset",
      cell: (a) => <span className="font-medium">{a.assetNumber}</span>,
      sortValue: (a) => a.assetNumber,
      hideable: false,
    },
    { id: "type", header: "Type", cell: (a) => a.unitTypeName, sortValue: (a) => a.unitTypeName },
    {
      id: "where",
      header: "Where",
      cell: (a) => <span className="block max-w-popover truncate">{a.where}</span>,
      sortValue: (a) => a.where,
    },
    {
      id: "status",
      header: "Status",
      cell: (a) => <StatusBadge row={a} />,
      sortValue: (a) => (a.daysOverdue ? -a.daysOverdue : a.status),
    },
    {
      id: "due",
      header: "Due back",
      cell: (a) => <span className="num">{dueText(a)}</span>,
      sortValue: (a) => a.expectedReturn,
      align: "right",
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          <span className="num">{plural(register.assets.length, "asset")}</span> ·{" "}
          <span className="num">{out}</span> at customers ·{" "}
          <span className={overdue ? "num font-medium text-warning-fg" : "num"}>
            {overdue} overdue
          </span>
        </p>
        {canManage ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add assets
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input
          leadingIcon={<Search />}
          aria-label="Search assets"
          placeholder="Number, type or place"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          aria-label="Status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "all", label: "Any status" },
            { value: "overdue", label: "Overdue back" },
            ...ASSET_STATUSES.map((s) => ({ value: s.value, label: s.label })),
          ]}
        />
        <Select
          aria-label="Type"
          value={type}
          onValueChange={setType}
          options={[
            { value: "all", label: "Any type" },
            ...register.unitTypes.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          aria-label="Customer"
          value={customer ?? "all"}
          onValueChange={(v) => setCustomer(v === "all" ? null : v)}
          options={[
            { value: "all", label: "Any customer" },
            ...customers.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
      </div>

      {register.assets.length ? (
        <DataTable
          label="Assets"
          columns={columns}
          rows={rows}
          getRowId={(a) => a.id}
          onRowClick={(a) => setSelected(a.id)}
          selectedRowId={selected}
          empty={<EmptyState compact title="No assets match" description="Try another filter." />}
          renderCard={(a) => (
            <EntityCard
              title={
                <button
                  type="button"
                  className="text-left font-semibold hover:underline"
                  onClick={() => setSelected(a.id)}
                >
                  {a.assetNumber}
                </button>
              }
              badges={<StatusBadge row={a} />}
              lines={[
                `${a.unitTypeName} · ${a.where}`,
                a.expectedReturn ? `Due back ${dueText(a)}` : null,
              ]}
              actions={null}
            />
          )}
        />
      ) : (
        <Card>
          <EmptyState
            icon={Boxes}
            title="No returnable assets yet"
            description="Add your stillages, A-frames or cages here, then send and collect them with loads."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setAdding(true)}>
                  Add assets
                </Button>
              ) : null
            }
          />
        </Card>
      )}

      {selectedRow ? (
        <AssetPanel
          key={selectedRow.id}
          row={selectedRow}
          register={register}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {canManage ? <AddAssets register={register} open={adding} onOpenChange={setAdding} /> : null}
    </div>
  );
}
