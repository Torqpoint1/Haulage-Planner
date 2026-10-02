"use server";

import { formObject } from "@/lib/settings/form";
import type { DeleteResult, FormState } from "@/lib/settings/result";
import { asAdmin, deleteRow, describeDbError, refresh, upsertRow } from "@/lib/settings/save";
import { parseCapacities, parseVehicle } from "@/lib/settings/schemas";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/vehicles";
const UNIQUE = {
  vehicles_registration_key: {
    field: "registration",
    message: "Another vehicle has this registration.",
  },
};

export async function saveVehicle(id: string | null, formData: FormData): Promise<FormState> {
  return asAdmin(async () => {
    const input = formObject(formData);
    const vehicle = parseVehicle(input);
    const capacities = parseCapacities(input);
    if (!vehicle.ok || !capacities.ok) {
      return {
        ok: false,
        errors: {
          ...(vehicle.ok ? {} : vehicle.errors),
          ...(capacities.ok ? {} : capacities.errors),
        },
      };
    }
    const result = await upsertRow("vehicles", id, vehicle.data, UNIQUE);
    if (!result.ok || !result.id) return result;

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_vehicle_capacities", {
      target_vehicle_id: result.id,
      capacities: capacities.data,
    });
    if (error) return describeDbError(error);
    refresh(PATH);
    return result;
  });
}

export async function deleteVehicle(id: string): Promise<DeleteResult> {
  return asAdmin(async () => {
    const result = await deleteRow("vehicles", id);
    if (result.ok) refresh(PATH);
    return result;
  });
}
