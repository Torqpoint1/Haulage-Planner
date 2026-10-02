"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { locatePostcode } from "@/lib/customers/locate";
import { parseContact, parseCustomer, parseSite } from "@/lib/customers/schemas";
import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { deleteRow, describeDbError, upsertRow, withCapability } from "@/lib/settings/save";
import { createClient } from "@/lib/supabase/server";

/** Planners and admins edit customers (spec 3); RLS enforces the same. */
const edit = <T extends FormState | DeleteResult>(run: () => Promise<T>) =>
  withCapability("customers.edit", run);

const refresh = (customerId?: string) => {
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`, "layout");
};

const CUSTOMER_UNIQUE = {
  customers_account_ref_key: {
    field: "account_ref",
    message: "Another customer has this account ref.",
  },
};

export async function saveCustomer(id: string | null, formData: FormData): Promise<FormState> {
  return edit(async () => {
    const parsed = parseCustomer(formObject(formData));
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const result = await upsertRow("customers", id, parsed.data, CUSTOMER_UNIQUE);
    if (result.ok) refresh(result.id);
    return result;
  });
}

export async function deleteCustomer(id: string): Promise<DeleteResult> {
  return edit(async () => {
    const result = await deleteRow("customers", id);
    if (result.ok) refresh();
    return result;
  });
}

export type SiteSaveState = FormState & { located?: boolean };

export async function saveSite(id: string | null, formData: FormData): Promise<SiteSaveState> {
  return edit(async () => {
    const input = formObject(formData);
    const customerId = z.uuid().safeParse(input.customer_id);
    if (!customerId.success) return { ok: false, error: "This customer no longer exists." };
    const parsed = parseSite(input);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };

    const supabase = await createClient();
    const { data: current } = id
      ? await supabase
          .from("sites")
          .select("postcode, latitude, location_source")
          .eq("id", id)
          .maybeSingle()
      : { data: null };

    // Place the pin from the postcode for new sites, when the postcode changes, or when
    // there's no position yet. A pin someone moved by hand stays put otherwise.
    let location: Record<string, unknown> = {};
    let located = current?.latitude !== null && current?.latitude !== undefined;
    const postcodeChanged = !current || current.postcode !== parsed.data.postcode;
    if (postcodeChanged || current?.latitude === null) {
      const found = await locatePostcode(supabase, parsed.data.postcode);
      located = Boolean(found);
      location = found
        ? { latitude: found.latitude, longitude: found.longitude, location_source: "postcode" }
        : { latitude: null, longitude: null, location_source: null };
    }

    const result = await upsertRow("sites", id, {
      ...parsed.data,
      ...location,
      customer_id: customerId.data,
    });
    if (result.ok) refresh(customerId.data);
    return { ...result, located };
  });
}

export async function deleteSite(id: string): Promise<DeleteResult> {
  return edit(async () => {
    const result = await deleteRow("sites", id);
    if (result.ok) refresh();
    return result;
  });
}

/** Move the pin by hand (drag, click or typed coordinates), or null to reset to the postcode. */
export async function setSitePosition(
  siteId: string,
  position: { latitude: number; longitude: number } | null,
): Promise<DeleteResult> {
  return edit(async () => {
    const supabase = await createClient();
    const { data: site } = await supabase
      .from("sites")
      .select("postcode, customer_id")
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return { ok: false, error: "This site no longer exists." };

    let update: Record<string, unknown>;
    if (position) {
      const valid = z
        .object({ latitude: z.number().min(49).max(61), longitude: z.number().min(-9).max(3) })
        .safeParse(position);
      if (!valid.success)
        return { ok: false, error: "That position isn't in the UK. Check the coordinates." };
      update = { ...valid.data, location_source: "manual" };
    } else {
      const found = await locatePostcode(supabase, site.postcode);
      if (!found)
        return {
          ok: false,
          error: "We couldn't find this postcode on the map. Place the pin by hand.",
        };
      update = {
        latitude: found.latitude,
        longitude: found.longitude,
        location_source: "postcode",
      };
    }
    const { error } = await supabase.from("sites").update(update).eq("id", siteId);
    if (error) return describeDbError(error) as DeleteResult;
    refresh(site.customer_id);
    return { ok: true };
  });
}

export async function verifySite(siteId: string): Promise<DeleteResult> {
  return edit(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("verify_site", { target_site_id: siteId });
    if (error) return describeDbError(error) as DeleteResult;
    refresh();
    revalidatePath("/customers", "layout");
    return { ok: true };
  });
}

export async function saveContact(id: string | null, formData: FormData): Promise<FormState> {
  return edit(async () => {
    const input = formObject(formData);
    const customerId = z.uuid().safeParse(input.customer_id);
    if (!customerId.success) return { ok: false, error: "This customer no longer exists." };
    const parsed = parseContact(input);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    const result = await upsertRow("contacts", id, {
      ...parsed.data,
      customer_id: customerId.data,
    });
    if (result.ok) refresh(customerId.data);
    return result;
  });
}

export async function deleteContact(id: string): Promise<DeleteResult> {
  return edit(async () => {
    const result = await deleteRow("contacts", id);
    if (result.ok) refresh();
    return result;
  });
}
