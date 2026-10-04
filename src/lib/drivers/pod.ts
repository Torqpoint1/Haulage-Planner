import { z } from "zod";
import { FAILURE_REASONS, MAX_PHOTOS, type Outcome, type RunStop } from "./types";

/**
 * Proof of delivery as the phone captures it, before anything is uploaded.
 * Checked on the phone so a driver can fix it straight away, offline; the
 * server and database check it again.
 */
export type PodDraft = {
  outcome: Outcome;
  receivedBy: string;
  hasSignature: boolean;
  noSignature: boolean;
  photoCount: number;
  failureReason: string | null;
  note: string;
  /** order line id → delivered quantity (part deliveries). */
  quantities: Record<string, number>;
  /** Assets planned for collection here that the driver ticked as collected. */
  collectedCount: number;
};

export type PodErrors = Partial<
  Record<
    "receivedBy" | "signature" | "failureReason" | "note" | "quantities" | "photos" | "collected",
    string
  >
>;

export function validatePod(draft: PodDraft, stop: Pick<RunStop, "orders">): PodErrors {
  const errors: PodErrors = {};
  if (draft.photoCount > MAX_PHOTOS) errors.photos = `Take up to ${MAX_PHOTOS} photos.`;
  if (draft.outcome === "failed") {
    if (!draft.failureReason) errors.failureReason = "Choose why the delivery failed.";
    if (draft.note.trim().length < 2) errors.note = "Add a note saying what happened.";
    return errors;
  }
  // A collection with nothing to deliver: no one signs, but something must come back.
  if (!stop.orders.length) {
    if (!draft.collectedCount)
      errors.collected = "Tick what you collected, or record the collection as failed.";
    return errors;
  }
  if (draft.receivedBy.trim().length < 2)
    errors.receivedBy = "Enter the name of the person who received it.";
  if (!draft.hasSignature && !(draft.noSignature && draft.photoCount > 0)) {
    errors.signature = draft.noSignature
      ? "Take a photo to show where you left it."
      : "Get a signature, or tick that nobody can sign.";
  }
  if (draft.outcome === "part_delivered") {
    const lines = stop.orders.flatMap((o) => o.lines);
    let short = false;
    let some = false;
    for (const line of lines) {
      const q = draft.quantities[line.id] ?? line.quantity;
      if (!Number.isInteger(q) || q < 0 || q > line.quantity) {
        errors.quantities = "Delivered quantities must be between 0 and the quantity ordered.";
        return errors;
      }
      if (q < line.quantity) short = true;
      if (q > 0) some = true;
    }
    if (lines.length && (!short || !some))
      errors.quantities =
        "For a part delivery, enter what was delivered: some, but not everything.";
  }
  return errors;
}

/** What the phone sends once the signature and photos are uploaded. */
export const podSubmissionSchema = z.object({
  clientId: z.uuid(),
  stopId: z.uuid(),
  outcome: z.enum(["delivered", "part_delivered", "failed"]),
  receivedBy: z.string().max(120),
  signaturePath: z.string().max(500).nullable(),
  noSignature: z.boolean(),
  photoPaths: z.array(z.string().max(500)).max(MAX_PHOTOS),
  failureReason: z.enum(FAILURE_REASONS.map((r) => r.value) as [string, ...string[]]).nullable(),
  note: z.string().max(2000),
  lines: z
    .array(z.object({ orderLineId: z.uuid(), quantity: z.number().int().min(0).max(10000) }))
    .max(500),
  collected: z.array(z.uuid()).max(100).default([]),
  recordedAt: z.iso.datetime({ offset: true }),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0).nullable(),
    })
    .nullable(),
});
export type PodSubmission = z.infer<typeof podSubmissionSchema>;

/** Result of sending one submission. `retry` false means sending it again won't help. */
export type PodResult = { ok: true } | { ok: false; error: string; retry: boolean };

/** Where the stop's files live in storage. The database checks the same folder. */
export function podFolder(organisationId: string, stopId: string, clientId: string) {
  return `${organisationId}/pods/${stopId}/${clientId}`;
}
