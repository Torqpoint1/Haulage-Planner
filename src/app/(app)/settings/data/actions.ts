"use server";

import { getSession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/services/email";
import type { FormState } from "@/lib/settings/result";
import { asAdmin, refresh } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/data";

/** Ask for the organisation and its data to be deleted (spec 12). */
export async function requestDeletion(formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const session = await getSession();
    const name = session?.membership?.organisation.name ?? "";
    const confirm = String(formData.get("confirm") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const errors: Record<string, string> = {};
    if (confirm.toLowerCase() !== name.trim().toLowerCase()) {
      errors.confirm = `Type ${name} to confirm.`;
    }
    if (reason.length > 2000) errors.reason = "Keep the reason under 2,000 characters.";
    if (Object.keys(errors).length) return { ok: false, errors };

    const supabase = await createClient();
    const { error } = await supabase.from("deletion_requests").insert({ reason });
    if (error) {
      return {
        ok: false,
        error:
          error.code === "23505"
            ? "Deletion has already been requested."
            : "The request wasn't sent. Try again.",
      };
    }
    // Tell whoever runs the service, when that's set up; the request is recorded either way.
    const operator = process.env.OPERATOR_EMAIL;
    if (operator) {
      await sendEmail({
        to: operator,
        subject: `Deletion requested: ${name}`,
        text: [
          `${session?.fullName || session?.email} asked for ${name} (organisation ${session?.membership?.organisation.id}) and all its data to be deleted.`,
          `Reason: ${reason || "none given"}`,
          "Delete it after 30 days unless the request is cancelled in Settings → Your data.",
        ].join("\n\n"),
      });
    }
    refresh(PATH);
    return { ok: true };
  });
}

export async function cancelDeletion(id: string): Promise<FormState> {
  return asAdmin(async () => {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const { error } = await supabase
      .from("deletion_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: claims?.claims.sub ?? null,
      })
      .eq("id", id)
      .eq("status", "requested");
    if (error) return { ok: false, error: "The request wasn't cancelled. Try again." };
    refresh(PATH);
    return { ok: true };
  });
}
