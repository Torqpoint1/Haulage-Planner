"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { DataTable, type Column } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { EntityForm } from "./entity-form";

type EntityManagerProps<T> = {
  rows: T[];
  getId: (row: T) => string;
  getName: (row: T) => string;
  /** "vehicle" → "Add vehicle", "Vehicle saved". */
  singular: string;
  /** Accessible name for the list, e.g. "Vehicles". */
  label: string;
  columns: Column<T>[];
  /** Stacked view for phones and tablets; receives the edit/delete buttons. */
  renderCard: (row: T, actions: React.ReactNode) => React.ReactNode;
  /** Form fields for a new (null) or existing row. */
  renderFields: (row: T | null) => React.ReactNode;
  save: (id: string | null, formData: FormData) => Promise<FormState>;
  remove: (id: string) => Promise<DeleteResult>;
  /** What deleting also removes, shown in the confirmation. */
  deleteWarning?: string;
  empty: {
    icon: React.ComponentProps<typeof EmptyState>["icon"];
    title: string;
    description: string;
  };
  /** Extra buttons beside "Add", e.g. a starter set. */
  extraActions?: React.ReactNode;
  /** Extra empty-state action, e.g. "Add common pallets". */
  emptyAction?: React.ReactNode;
  initialSort?: React.ComponentProps<typeof DataTable<T>>["initialSort"];
};

/**
 * List, add, edit and delete one kind of setting. Editing happens in a side
 * panel so the list stays in view (spec 9.2's pattern), and deleting always
 * asks first.
 */
export function EntityManager<T>({
  rows,
  getId,
  getName,
  singular,
  label,
  columns,
  renderCard,
  renderFields,
  save,
  remove,
  deleteWarning,
  empty,
  extraActions,
  emptyAction,
  initialSort,
}: EntityManagerProps<T>) {
  const router = useRouter();
  const formId = useId().replace(/:/g, "");
  const [editing, setEditing] = useState<{ row: T | null; key: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [removing, startRemove] = useTransition();

  const open = (row: T | null) => setEditing({ row, key: Date.now() });

  const actions = (row: T) => (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`Edit ${getName(row)}`}
        onClick={() => open(row)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`Delete ${getName(row)}`}
        onClick={() => setDeleting(row)}
      >
        <Trash2 aria-hidden />
      </Button>
    </span>
  );

  const allColumns: Column<T>[] = [
    ...columns,
    {
      id: "actions",
      header: "Actions",
      align: "right",
      hideable: false,
      cell: (row) => actions(row),
    },
  ];

  const title = editing?.row ? `Edit ${getName(editing.row)}` : `Add ${singular}`;
  const Capital = singular.charAt(0).toUpperCase() + singular.slice(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          <span className="num">{rows.length}</span> {rows.length === 1 ? singular : `${singular}s`}
        </p>
        <div className="flex flex-wrap gap-2">
          {extraActions}
          <Button variant="primary" onClick={() => open(null)}>
            <Plus aria-hidden />
            Add {singular}
          </Button>
        </div>
      </div>

      <DataTable
        label={label}
        columns={allColumns}
        rows={rows}
        getRowId={getId}
        initialSort={initialSort}
        renderCard={(row) => renderCard(row, actions(row))}
        empty={
          <EmptyState
            compact
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={
              <Button variant="primary" onClick={() => open(null)}>
                <Plus aria-hidden />
                Add {singular}
              </Button>
            }
            secondaryAction={emptyAction}
          />
        }
      />

      <SidePanel
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        title={title}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={saving}>
              Save {singular}
            </Button>
          </>
        }
      >
        {editing ? (
          <EntityForm
            key={editing.key}
            id={formId}
            action={(formData) => save(editing.row ? getId(editing.row) : null, formData)}
            onPendingChange={setSaving}
            onSaved={() => {
              toast.success(`${Capital} saved`);
              setEditing(null);
              router.refresh();
            }}
          >
            {renderFields(editing.row)}
          </EntityForm>
        ) : null}
      </SidePanel>

      <Modal
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={deleting ? `Delete ${getName(deleting)}?` : `Delete ${singular}`}
        description={
          deleteWarning ?? "This can't be undone. The change is recorded in the audit log."
        }
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep</Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={() => {
                const row = deleting;
                if (!row) return;
                startRemove(async () => {
                  const result = await remove(getId(row));
                  setDeleting(null);
                  if (result.ok) {
                    toast.success(`${getName(row)} deleted`);
                    router.refresh();
                  } else toast.error(result.error);
                });
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Standard stacked card: title line, secondary lines, actions on the right. */
export function EntityCard({
  title,
  lines,
  badges,
  actions,
  leading,
}: {
  title: React.ReactNode;
  lines?: React.ReactNode[];
  badges?: React.ReactNode;
  actions: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          {badges}
        </div>
        {lines?.filter(Boolean).map((line, i) => (
          <span key={i} className="min-w-0 text-sm break-words text-text-muted">
            {line}
          </span>
        ))}
      </div>
      {actions}
    </div>
  );
}
