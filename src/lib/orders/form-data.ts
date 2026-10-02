import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Everything the order form needs to offer: customers, their sites and unit types. */
export async function orderFormOptions() {
  const supabase = await createClient();
  const [customers, sites, unitTypes] = await Promise.all([
    supabase.from("customers").select("id, name, account_ref").order("name"),
    supabase
      .from("sites")
      .select("id, customer_id, name, postcode, delivery_instructions")
      .order("name"),
    supabase.from("unit_types").select("id, name, short_code, typical_weight_kg").order("name"),
  ]);
  return {
    customers: customers.data ?? [],
    sites: sites.data ?? [],
    unitTypes: (unitTypes.data ?? []).map((u) => ({
      ...u,
      typical_weight_kg: Number(u.typical_weight_kg),
    })),
  };
}
