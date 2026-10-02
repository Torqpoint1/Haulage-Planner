import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriversManager, type Driver, type DriverLogin } from "./drivers-manager";

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const [{ data: drivers }, { data: logins }] = await Promise.all([
    supabase.from("drivers").select("*").order("name"),
    supabase
      .from("memberships")
      .select("user_id, profile:profiles(full_name, email)")
      .eq("role", "driver"),
  ]);
  const options: DriverLogin[] = (logins ?? []).map((m) => {
    const p = m.profile as unknown as { full_name: string; email: string } | null;
    return {
      userId: m.user_id,
      label: p?.full_name ? `${p.full_name} (${p.email})` : (p?.email ?? "Unknown"),
    };
  });
  return (
    <PageContainer>
      <SettingsHeader
        title="Drivers"
        description="Your own drivers: contact details, licences and the days they work."
      />
      <DriversManager rows={(drivers ?? []) as Driver[]} logins={options} />
    </PageContainer>
  );
}
