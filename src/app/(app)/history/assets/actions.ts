"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccess } from "@/lib/auth/roles";
import { requireMember } from "@/lib/auth/session";
import { loadAssetMovements, type AssetMovement } from "@/lib/assets/data";
import { parseAssetNumbers } from "@/lib/assets/numbers";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { describeDbError, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

const refresh = () => {
  revalidatePath("/history/assets");
  revalidatePath("/plan");
  revalidatePath("/customers", "layout");
};
const isIso = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Add returnable assets at a depot: one number per line, or ranges like ST-101 to ST-120. */
export async function addAssets(formData: FormData): Promise<FormState> {
  return withCapability("assets.manage", async () => {
    const f = formObject(formData);
    const errors: Record<string, string> = {};
    const unitTypeId = String(f.unit_type_id ?? "");
    const depotId = String(f.depot_id ?? "");
    if (!z.uuid().safeParse(unitTypeId).success) errors.unit_type_id = "Choose the type of asset.";
    if (!z.uuid().safeParse(depotId).success) errors.depot_id = "Choose the depot they're at.";
    const parsed = parseAssetNumbers(String(f.numbers ?? ""));
    if (parsed.errors.length) errors.numbers = parsed.errors.slice(0, 3).join(" ");
    if (Object.keys(errors).length) return { ok: false, errors };

    const supabase = await createClient();
    const { data: taken } = await supabase.from("assets").select("asset_number");
    const used = new Set((taken ?? []).map((a) => a.asset_number.trim().toUpperCase()));
    const clash = parsed.numbers.filter((n) => used.has(n.toUpperCase()));
    if (clash.length) {
      return {
        ok: false,
        errors: {
          numbers: `Already in use: ${clash.slice(0, 5).join(", ")}${clash.length > 5 ? ` and ${clash.length - 5} more` : ""}.`,
        },
      };
    }
    const { error } = await supabase.from("assets").insert(
      parsed.numbers.map((asset_number) => ({
        unit_type_id: unitTypeId,
        asset_number,
        depot_id: depotId,
      })),
    );
    if (error) {
      if (error.code === "P0001") return { ok: false, errors: { unit_type_id: error.message } };
      return describeDbError(error, {
        assets_number_key: { field: "numbers", message: "One of those numbers is already in use." },
      });
    }
    refresh();
    return { ok: true };
  });
}

const moveSchema = z.object({
  assetId: z.uuid(),
  to: z.enum(["at_depot", "at_customer", "lost", "retired"]),
  depotId: z.uuid().nullable(),
  siteId: z.uuid().nullable(),
  dueBack: z.string().nullable(),
  note: z.string().max(500),
});

/** Record where an asset really is: found at a site, back at the depot, lost or retired. */
export async function moveAsset(input: z.input<typeof moveSchema>): Promise<DeleteResult> {
  return withCapability("assets.manage", async () => {
    const parsed = moveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Choose where the asset is now." };
    const m = parsed.data;
    if (m.to === "at_depot" && !m.depotId) return { ok: false, error: "Choose the depot." };
    if (m.to === "at_customer" && !m.siteId)
      return { ok: false, error: "Choose the customer site." };
    if (m.dueBack && !isIso(m.dueBack)) return { ok: false, error: "Enter a valid due back date." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("move_asset", {
      target_asset: m.assetId,
      to_status: m.to,
      target_depot: m.depotId,
      target_site: m.siteId,
      due_back: m.dueBack || null,
      note: m.note,
    });
    if (error) {
      if (["P0001", "P0002", "22023", "42501"].includes(error.code ?? ""))
        return { ok: false, error: error.message };
      return describeDbError(error) as DeleteResult;
    }
    refresh();
    return { ok: true };
  });
}

/** Change an asset's notes, or when it's due back from the customer. */
export async function updateAsset(
  assetId: string,
  change: { notes?: string; dueBack?: string | null },
): Promise<DeleteResult> {
  return withCapability("assets.manage", async () => {
    if (!z.uuid().safeParse(assetId).success)
      return { ok: false, error: "That asset doesn't exist." };
    const row: Record<string, unknown> = {};
    if (change.notes !== undefined) {
      if (change.notes.length > 1000)
        return { ok: false, error: "Keep notes under 1,000 characters." };
      row.notes = change.notes.trim();
    }
    if (change.dueBack !== undefined) {
      if (change.dueBack && !isIso(change.dueBack))
        return { ok: false, error: "Enter a valid due back date." };
      row.expected_return_date = change.dueBack || null;
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("assets")
      .update(row)
      .eq("id", assetId)
      .select("id");
    if (error) {
      if (error.code === "23514")
        return {
          ok: false,
          error: "Due back can only be set while it's at a customer, after it was dropped.",
        };
      return describeDbError(error) as DeleteResult;
    }
    if (!data?.length)
      return { ok: false, error: "That asset has been removed, or you can't change it." };
    refresh();
    return { ok: true };
  });
}

/** Where an asset has been. Anyone who can see History can see this. */
export async function assetMovementsAction(
  assetId: string,
): Promise<{ ok: true; movements: AssetMovement[] } | { ok: false; error: string }> {
  const session = await requireMember();
  if (!canAccess(session.membership.role, "history"))
    return { ok: false, error: "You don't have access to that." };
  if (!z.uuid().safeParse(assetId).success)
    return { ok: false, error: "That asset doesn't exist." };
  return { ok: true, movements: await loadAssetMovements(assetId) };
}
