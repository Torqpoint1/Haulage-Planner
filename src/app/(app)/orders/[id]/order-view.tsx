"use client";

import { Ban, FileText, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { RestrictionChips } from "@/components/customers/site-badges";
import { ReadinessBadge, StatusBadge, UrgencyBadge } from "@/components/orders/badges";
import { SettingsHeader } from "@/components/settings/settings-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { Site } from "@/lib/customers/types";
import {
  formatDate,
  formatDateTime,
  formatIsoDate,
  formatKg,
  formatNumber,
  fromIsoDate,
  toIsoDate,
} from "@/lib/format";
import type { HistoryEvent } from "@/lib/orders/history";
import { READINESS } from "@/lib/orders/options";
import { formatWeight, unitsSummary } from "@/lib/orders/summary";
import type { OrderRow } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/client";
import {
  addAttachment,
  deleteAttachment,
  deleteOrder,
  setOrderCancelled,
  updateReadiness,
} from "../actions";

export type Attachment = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
  url: string | null;
};

type Props = {
  order: OrderRow & { site_detail: Site | null };
  attachments: Attachment[];
  history: (HistoryEvent & { actor: string })[];
  orgId: string;
  canEdit: boolean;
};

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];
const MAX_BYTES = 20 * 1024 * 1024;

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const dash = (v: string | null | undefined) =>
  v ? v : <span className="text-text-subtle">None</span>;

function ReadinessEditor({ order, onDone }: { order: OrderRow; onDone: () => void }) {
  const router = useRouter();
  const [readiness, setReadiness] = useState<string>(order.readiness);
  const [missing, setMissing] = useState(order.missing_items);
  const [expected, setExpected] = useState<Date | null>(
    order.expected_ready_date ? fromIsoDate(order.expected_ready_date) : null,
  );
  const [pending, start] = useTransition();
  const ready = readiness === "ready";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await updateReadiness(order.id, {
            readiness,
            missing_items: missing,
            expected_ready_date: expected ? toIsoDate(expected) : null,
          });
          if (result.ok) {
            toast.success("Readiness updated");
            onDone();
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Readiness">
          <Select options={[...READINESS]} value={readiness} onValueChange={setReadiness} />
        </Field>
        {!ready ? (
          <Field label="Expected ready date">
            <DatePicker value={expected} onValueChange={setExpected} />
          </Field>
        ) : null}
      </div>
      {!ready ? (
        <Field label="Missing items">
          <Input value={missing} onChange={(e) => setMissing(e.target.value)} />
        </Field>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={pending}>
          Save readiness
        </Button>
      </div>
    </form>
  );
}

function Documents({
  order,
  attachments,
  orgId,
  canEdit,
}: {
  order: OrderRow;
  attachments: Attachment[];
  orgId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [deleting, startDelete] = useTransition();

  function upload(files: FileList) {
    const list = [...files];
    const bad = list.find((f) => !ACCEPTED.includes(f.type));
    if (bad)
      return toast.error(`${bad.name} isn't a PDF or photo. Use PDF, PNG, JPEG, WebP or HEIC.`);
    const big = list.find((f) => f.size > MAX_BYTES);
    if (big) return toast.error(`${big.name} is over 20 MB. Use a smaller file.`);
    startUpload(async () => {
      const supabase = createClient();
      for (const file of list) {
        const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-100);
        const path = `${orgId}/orders/${order.id}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage
          .from("organisation-files")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`${file.name} didn't upload. Check your connection and try again.`);
          continue;
        }
        const result = await addAttachment({
          orderId: order.id,
          path,
          fileName: file.name.slice(0, 200),
          contentType: file.type as "application/pdf",
          size: file.size,
        });
        if (result.ok) toast.success(`${file.name} added`);
        else toast.error(result.error);
      }
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <Section
      title="Documents"
      actions={
        canEdit ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPTED.join(",")}
              className="sr-only"
              aria-label="Choose documents to add"
              onChange={(e) => e.target.files?.length && upload(e.target.files)}
            />
            <Button size="sm" loading={uploading} onClick={() => input.current?.click()}>
              <Upload aria-hidden />
              Add document
            </Button>
          </>
        ) : null
      }
    >
      {attachments.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {attachments.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-3 py-2">
              <FileText className="size-icon shrink-0 text-text-muted" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium text-accent-text hover:underline"
                  >
                    {a.file_name}
                  </a>
                ) : (
                  <span className="truncate text-sm font-medium">{a.file_name}</span>
                )}
                <span className="text-xs text-text-muted">
                  {fileSize(a.size_bytes)} · added {formatDate(a.created_at)}
                </span>
              </div>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Remove ${a.file_name}`}
                  onClick={() => setRemoving(a)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          icon={FileText}
          title="No documents"
          description={
            canEdit
              ? "Add delivery notes, drawings or photos (PDF or images, up to 20 MB)."
              : undefined
          }
        />
      )}
      <Modal
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.file_name ?? "document"}?`}
        description="The file will be deleted. This can't be undone."
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteAttachment(removing!.id);
                  setRemoving(null);
                  if (result.ok) {
                    toast.success("Document removed");
                    router.refresh();
                  } else toast.error(result.error);
                })
              }
            >
              Remove
            </Button>
          </>
        }
      />
    </Section>
  );
}

export function OrderView({ order, attachments, history, orgId, canEdit }: Props) {
  const router = useRouter();
  const [editingReadiness, setEditingReadiness] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [busy, startBusy] = useTransition();
  const site = order.site_detail;
  const lines = [...order.lines].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const cancelled = order.status === "cancelled";
  const cancellable = ["unplanned", "planned"].includes(order.status);
  const deletable = ["unplanned", "cancelled"].includes(order.status);

  const actions = canEdit ? (
    <div className="flex flex-wrap gap-2">
      {cancelled ? (
        <Button
          loading={busy}
          onClick={() =>
            startBusy(async () => {
              const result = await setOrderCancelled(order.id, false);
              if (result.ok) {
                toast.success("Order reinstated");
                router.refresh();
              } else toast.error(result.error);
            })
          }
        >
          <RotateCcw aria-hidden />
          Reinstate
        </Button>
      ) : cancellable ? (
        <Button onClick={() => setConfirm("cancel")}>
          <Ban aria-hidden />
          Cancel order
        </Button>
      ) : null}
      {deletable ? (
        <Button variant="ghost" onClick={() => setConfirm("delete")}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      ) : null}
      <Button variant="primary" asChild>
        <Link href={`/orders/${order.id}/edit`}>
          <Pencil aria-hidden />
          Edit order
        </Link>
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title={order.order_ref}
        backHref="/orders"
        backLabel="Orders"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={order.status} />
            <ReadinessBadge value={order.readiness} />
            <UrgencyBadge value={order.urgency} />
            <span>
              {order.customer?.name} · required {formatIsoDate(order.required_date)}
            </span>
          </span>
        }
        actions={actions}
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Section title="What's being delivered">
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y divide-border">
                {lines.map((l, i) => (
                  <li
                    key={l.id ?? i}
                    className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">
                        <span className="num">{formatNumber(l.quantity)}</span> ×{" "}
                        {l.unit_type?.name ?? "Unknown unit"}
                      </span>
                      {l.description ? (
                        <span className="text-sm break-words text-text-muted">{l.description}</span>
                      ) : null}
                    </div>
                    <span className="num text-sm text-text-muted">
                      {formatKg(Number(l.weight_per_unit_kg))} each ·{" "}
                      {formatKg(Math.round(l.quantity * Number(l.weight_per_unit_kg)))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="font-medium">{unitsSummary(lines)}</span>
                <span className="num font-medium">{formatWeight(lines)}</span>
              </p>
            </div>
          </Section>

          <Section
            title="Readiness"
            actions={
              canEdit && !editingReadiness && !cancelled ? (
                <Button size="sm" onClick={() => setEditingReadiness(true)}>
                  Update readiness
                </Button>
              ) : null
            }
          >
            {editingReadiness ? (
              <ReadinessEditor order={order} onDone={() => setEditingReadiness(false)} />
            ) : (
              <Details
                rows={[
                  ["Readiness", <ReadinessBadge key="r" value={order.readiness} />],
                  [
                    "Expected ready",
                    order.expected_ready_date
                      ? formatIsoDate(order.expected_ready_date)
                      : dash(null),
                  ],
                  ["Missing items", dash(order.missing_items)],
                ]}
              />
            )}
          </Section>

          <Section title="Order details">
            <Details
              rows={[
                ["Customer PO", dash(order.customer_po)],
                ["Delivery note", dash(order.delivery_note_number)],
                ["Invoice", dash(order.invoice_number)],
                ["Required date", formatIsoDate(order.required_date)],
                [
                  "Earliest date",
                  order.earliest_date ? formatIsoDate(order.earliest_date) : dash(null),
                ],
                ["Latest date", order.latest_date ? formatIsoDate(order.latest_date) : dash(null)],
                ["Delivery instructions", dash(order.delivery_instructions)],
                ["Notes", dash(order.notes)],
              ]}
            />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Delivery site">
            {site ? (
              <div className="flex flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/customers/${site.customer_id}/sites/${site.id}`}
                    className="text-sm font-medium text-accent-text hover:underline"
                  >
                    {site.name}
                  </Link>
                  <span className="text-sm break-words text-text-muted">
                    {[site.address, site.postcode].filter(Boolean).join(", ")}
                  </span>
                  <Link
                    href={`/customers/${site.customer_id}`}
                    className="w-fit text-sm text-text-muted hover:text-text hover:underline"
                  >
                    {order.customer?.name}
                  </Link>
                </div>
                <RestrictionChips site={site} />
                {site.booking_required ? (
                  <p className="text-sm">
                    <span className="font-medium">Booking needed.</span> {site.how_to_book}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Site details unavailable.</p>
            )}
          </Section>

          <Documents order={order} attachments={attachments} orgId={orgId} canEdit={canEdit} />

          <Section title="History">
            {history.length ? (
              <ol className="flex flex-col gap-4">
                {history.map((h) => (
                  <li key={h.key} className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-text-muted">
                      {formatDateTime(h.at)} · {h.actor}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {h.changes.map((c) => (
                        <li key={c} className="text-sm break-words">
                          {c}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-text-muted">No changes recorded yet.</p>
            )}
          </Section>
        </div>
      </div>

      <Modal
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "delete" ? `Delete ${order.order_ref}?` : `Cancel ${order.order_ref}?`}
        description={
          confirm === "delete"
            ? "The order, its lines and its documents will be deleted. This can't be undone."
            : "It won't be offered for planning. You can reinstate it later."
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Keep order</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                startBusy(async () => {
                  const result =
                    confirm === "delete"
                      ? await deleteOrder(order.id)
                      : await setOrderCancelled(order.id, true);
                  const wasDelete = confirm === "delete";
                  setConfirm(null);
                  if (!result.ok) return void toast.error(result.error);
                  if (wasDelete) {
                    toast.success(`${order.order_ref} deleted`);
                    router.push("/orders");
                  } else {
                    toast.success(`${order.order_ref} cancelled`);
                    router.refresh();
                  }
                })
              }
            >
              {confirm === "delete" ? "Delete order" : "Cancel order"}
            </Button>
          </>
        }
      />
    </div>
  );
}
