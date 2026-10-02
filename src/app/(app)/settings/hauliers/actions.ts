"use server";

import { z } from "zod";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, describeDbError, refresh, upsertRow } from "@/lib/settings/save";
import { parseHaulier, parseRateCard, parseRatePrices } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/hauliers";
const UNIQUE = {
  hauliers_name_key: { field: "name", message: "You already have a haulier with this name." },
};

export async function saveHaulier(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const parsed = parseHaulier(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const result = await upsertRow("hauliers", id, parsed.data, UNIQUE);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function deleteHaulier(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("hauliers", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}

export async function saveRateCard(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const input = formObject(formData);
    const haulierId = z.uuid().safeParse(input.haulier_id);
    if (!haulierId.success) return { ok: false, error: "This haulier no longer exists." };
    const card = parseRateCard(input);
    const prices = parseRatePrices(input);
    if (!card.ok || !prices.ok) {
      return {
        ok: false,
        errors: { ...(card.ok ? {} : card.errors), ...(prices.ok ? {} : prices.errors) },
      };
    }
    const result = await upsertRow("rate_cards", id, { ...card.data, haulier_id: haulierId.data });
    if (!result.ok || !result.id) return result;

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_rate_card_prices", {
      target_rate_card_id: result.id,
      pallet_prices: prices.data.pallet,
      load_prices: prices.data.load,
    });
    if (error) return describeDbError(error);
    refresh(`${PATH}/${haulierId.data}`);
    refresh(PATH);
    return result;
  });
}

export async function deleteRateCard(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("rate_cards", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
