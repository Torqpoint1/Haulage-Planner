"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DeleteResult } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

const tickSchema = z.object({
  picked: z.boolean().optional(),
  loaded: z.boolean().optional(),
  shortage: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

/** Tick a line as picked or loaded, or flag a shortage (spec 9.5). Pickers, planners and admins. */
export async function tickLine(
  lineId: string,
  change: z.input<typeof tickSchema>,
): Promise<DeleteResult> {
  return withCapability("warehouse.tick", async () => {
    const parsed = tickSchema.safeParse(change);
    if (!z.uuid().safeParse(lineId).success || !parsed.success)
      return { ok: false, error: "That tick couldn't be saved." };
    if (parsed.data.shortage && (parsed.data.note ?? "").trim().length < 2) {
      return { ok: false, error: "Say what's short, e.g. “1 door frame missing”." };
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("tick_line", {
      target_line: lineId,
      set_picked: parsed.data.picked ?? null,
      set_loaded: parsed.data.loaded ?? null,
      set_shortage: parsed.data.shortage ?? null,
      note: parsed.data.note ?? null,
    });
    if (error) {
      if (error.code === "P0001" || error.code === "P0002")
        return { ok: false, error: error.message };
      return describeDbError(error) as DeleteResult;
    }
    revalidatePath("/warehouse");
    revalidatePath("/plan");
    return { ok: true };
  });
}
