import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FailureReason, Outcome } from "./types";

/** Everything recorded at a stop, for the planner (spec 6.10). Files come as short-lived links. */
export type PodDetails = {
  stopId: string;
  outcome: Outcome;
  receivedBy: string;
  noSignature: boolean;
  failureReason: FailureReason | null;
  note: string;
  recordedAt: string;
  /** When it reached us; later than recordedAt if the phone was offline. */
  receivedAt: string;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
  signatureUrl: string | null;
  photoUrls: string[];
  orders: {
    id: string;
    orderRef: string;
    status: string;
    lines: {
      id: string;
      unitName: string;
      description: string;
      ordered: number;
      delivered: number;
    }[];
  }[];
};

const LINK_SECONDS = 15 * 60;

export async function loadPodDetails(stopId: string): Promise<PodDetails | null> {
  const supabase = await createClient();
  const { data: pod } = await supabase
    .from("pods")
    .select(
      "id, stop_id, outcome, received_by, no_signature, failure_reason, note, recorded_at, created_at, latitude, longitude, accuracy_m, signature_path, photo_paths",
    )
    .eq("stop_id", stopId)
    .maybeSingle();
  if (!pod) return null;

  const paths = [pod.signature_path, ...(pod.photo_paths ?? [])].filter(Boolean) as string[];
  const [{ data: signed }, { data: lines, error: linesError }] = await Promise.all([
    paths.length
      ? supabase.storage.from("organisation-files").createSignedUrls(paths, LINK_SECONDS)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    supabase
      .from("pod_lines")
      .select(
        "order_line_id, ordered_quantity, delivered_quantity, orders(id, order_ref, status), order_lines!pod_lines_order_line_id_organisation_id_fkey(description, position, unit_types(name))",
      )
      .eq("pod_id", pod.id),
  ]);
  if (linesError) throw linesError;
  const urlFor = (path: string | null) =>
    path ? ((signed ?? []).find((s) => s.path === path)?.signedUrl ?? null) : null;

  type LineRow = {
    order_line_id: string;
    ordered_quantity: number;
    delivered_quantity: number;
    orders: { id: string; order_ref: string; status: string } | null;
    order_lines: {
      description: string;
      position: number;
      unit_types: { name: string } | null;
    } | null;
  };
  const byOrder = new Map<string, PodDetails["orders"][number] & { positions: number[] }>();
  for (const row of (lines ?? []) as unknown as LineRow[]) {
    if (!row.orders) continue;
    const entry = byOrder.get(row.orders.id) ?? {
      id: row.orders.id,
      orderRef: row.orders.order_ref,
      status: row.orders.status,
      lines: [],
      positions: [],
    };
    entry.lines.push({
      id: row.order_line_id,
      unitName: row.order_lines?.unit_types?.name ?? "Item",
      description: row.order_lines?.description ?? "",
      ordered: row.ordered_quantity,
      delivered: row.delivered_quantity,
    });
    entry.positions.push(row.order_lines?.position ?? 0);
    byOrder.set(row.orders.id, entry);
  }

  return {
    stopId: pod.stop_id,
    outcome: pod.outcome,
    receivedBy: pod.received_by,
    noSignature: pod.no_signature,
    failureReason: pod.failure_reason,
    note: pod.note,
    recordedAt: pod.recorded_at,
    receivedAt: pod.created_at,
    location:
      pod.latitude != null && pod.longitude != null
        ? { latitude: pod.latitude, longitude: pod.longitude, accuracy: pod.accuracy_m }
        : null,
    signatureUrl: urlFor(pod.signature_path),
    photoUrls: ((pod.photo_paths ?? []) as string[])
      .map(urlFor)
      .filter((u): u is string => Boolean(u)),
    orders: [...byOrder.values()]
      .sort((a, b) => a.orderRef.localeCompare(b.orderRef))
      .map(({ positions, ...o }) => ({
        ...o,
        lines: o.lines
          .map((l, i) => ({ l, p: positions[i] }))
          .sort((a, b) => a.p - b.p)
          .map((x) => x.l),
      })),
  };
}
