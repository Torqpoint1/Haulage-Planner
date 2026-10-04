import type { Metadata } from "next";
import { Upload } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { londonToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { VehiclesManager, type UnitTypeOption, type Vehicle } from "./vehicles-manager";

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  await requireArea("settings");
  await connection();
  const supabase = await createClient();
  const [{ data: vehicles }, { data: unitTypes }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*, capacities:vehicle_capacities(unit_type_id, max_units)")
      .order("name"),
    supabase.from("unit_types").select("id, name, short_code, colour_tag").order("name"),
  ]);
  return (
    <PageContainer>
      <SettingsHeader
        title="Vehicles"
        description="Your own fleet: what each vehicle carries, how it unloads, and what it costs to run."
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/vehicles/import">
              <Upload aria-hidden />
              Import CSV
            </Link>
          </Button>
        }
      />
      <VehiclesManager
        rows={(vehicles ?? []) as Vehicle[]}
        unitTypes={(unitTypes ?? []) as UnitTypeOption[]}
        today={londonToday()}
      />
    </PageContainer>
  );
}
