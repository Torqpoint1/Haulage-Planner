"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DeleteResult } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

const ids = z.array(z.uuid()).min(1).max(100);
const refresh = () => {
  revalidatePath("/plan");
  revalidatePath("/warehouse");
  revalidatePath("/history/assets");
};
function assetError(error: { code?: string; message: string }): DeleteResult {
  if (error.code === "P0001" || error.code === "P0002" || error.code === "22023")
    return { ok: false, error: error.message };
  if (error.code === "23505")
    return { ok: false, error: "One of those assets is already planned onto another stop." };
  return describeDbError(error) as DeleteResult;
}

/** Send returnable assets out with a delivery (planners, admins and the warehouse). */
export async function addDrops(stopId: string, assetIds: string[]): Promise<DeleteResult> {
  return withCapability("assets.assign", async () => {
    if (!z.uuid().safeParse(stopId).success || !ids.safeParse(assetIds).success)
      return { ok: false, error: "Choose the assets to send." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("stop_assets")
      .insert(assetIds.map((asset_id) => ({ stop_id: stopId, asset_id, direction: "drop" })));
    if (error) return assetError(error);
    refresh();
    return { ok: true };
  });
}

/** Add a collection of overdue or due assets to a load (spec 8.5). Planners and admins. */
export async function addCollection(loadId: string, assetIds: string[]): Promise<DeleteResult> {
  return withCapability("loads.edit", async () => {
    if (!z.uuid().safeParse(loadId).success || !ids.safeParse(assetIds).success)
      return { ok: false, error: "Choose the assets to collect." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_collection", {
      target_load: loadId,
      asset_ids: assetIds,
    });
    if (error) return assetError(error);
    refresh();
    return { ok: true };
  });
}

/** Take an asset off a stop before the load goes. Only planners can drop a collection. */
export async function removeStopAsset(
  stopId: string,
  assetId: string,
  direction: "drop" | "collect",
): Promise<DeleteResult> {
  return withCapability(direction === "collect" ? "loads.edit" : "assets.assign", async () => {
    if (!z.uuid().safeParse(stopId).success || !z.uuid().safeParse(assetId).success)
      return { ok: false, error: "That asset isn't on this stop." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stop_assets")
      .delete()
      .eq("stop_id", stopId)
      .eq("asset_id", assetId)
      .eq("direction", direction)
      .eq("outcome", "pending")
      .select("id");
    if (error) return assetError(error);
    if (!data?.length) return { ok: false, error: "That asset has already been dealt with." };
    refresh();
    return { ok: true };
  });
}
