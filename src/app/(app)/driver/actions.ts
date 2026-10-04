"use server";

import { revalidatePath } from "next/cache";
import { NotAllowedError, requireCapability } from "@/lib/auth/session";
import { podSubmissionSchema, type PodResult } from "@/lib/drivers/pod";
import { createClient } from "@/lib/supabase/server";

/**
 * Record proof of delivery for a stop (spec 6.10, 9.8). Called by the phone's
 * queue, possibly long after the driver pressed save and possibly more than
 * once; the client id makes repeats harmless. Files are already uploaded.
 */
export async function recordPod(input: unknown): Promise<PodResult> {
  try {
    await requireCapability("pod.record");
  } catch (error) {
    if (error instanceof NotAllowedError) return { ok: false, error: error.message, retry: false };
    throw error;
  }
  const parsed = podSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "This delivery record is incomplete. Record it again.",
      retry: false,
    };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_pod", {
    client_id: p.clientId,
    target_stop: p.stopId,
    outcome: p.outcome,
    received_by: p.receivedBy,
    signature_path: p.signaturePath,
    no_signature: p.noSignature,
    photo_paths: p.photoPaths,
    failure_reason: p.failureReason,
    note: p.note,
    lines: p.lines.map((l) => ({ order_line_id: l.orderLineId, quantity: l.quantity })),
    recorded_at: p.recordedAt,
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    accuracy_m: p.location?.accuracy ?? null,
    collected: p.collected,
  });
  if (error) {
    // Our own plain-English messages; only a missing upload is worth retrying.
    if (["P0001", "P0002", "42501", "22023"].includes(error.code ?? "")) {
      return { ok: false, error: error.message, retry: error.hint === "file_missing" };
    }
    console.error(error);
    return { ok: false, error: "Couldn't save just now. It will try again.", retry: true };
  }
  revalidatePath("/driver");
  revalidatePath("/plan");
  return { ok: true };
}
