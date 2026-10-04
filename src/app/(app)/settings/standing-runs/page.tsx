import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StandingRunsManager, type StandingRun } from "./standing-runs-manager";

export const metadata: Metadata = { title: "Standing runs" };

export default async function StandingRunsPage() {
  await requireArea("settings");
  const supabase = await createClient();
  const [{ data: runs }, { data: depots }, { data: vehicles }, { data: drivers }, { data: sites }] =
    await Promise.all([
      supabase
        .from("standing_runs")
        .select("*, sites:standing_run_sites(site_id, position)")
        .order("name"),
      supabase.from("depots").select("id, name").order("name"),
      supabase.from("vehicles").select("id, name").eq("active", true).order("name"),
      supabase.from("drivers").select("id, name").eq("active", true).order("name"),
      supabase.from("sites").select("id, name, postcode, customer:customers(name)").order("name"),
    ]);
  const rows: StandingRun[] = (runs ?? []).map((r) => ({
    ...(r as Omit<StandingRun, "site_ids">),
    cutoff_time: String(r.cutoff_time).slice(0, 5),
    start_time: String(r.start_time).slice(0, 5),
    site_ids: [...((r.sites ?? []) as { site_id: string; position: number }[])]
      .sort((a, b) => a.position - b.position)
      .map((s) => s.site_id),
  }));
  return (
    <PageContainer>
      <SettingsHeader
        title="Standing runs"
        description="Routine routes. Each run day gets a draft load on the plan, with orders for its sites received before the cut-off suggested onto it."
      />
      <StandingRunsManager
        rows={rows}
        depots={depots ?? []}
        vehicles={vehicles ?? []}
        drivers={drivers ?? []}
        sites={(sites ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          postcode: s.postcode,
          customer: (s.customer as unknown as { name: string } | null)?.name ?? "",
        }))}
      />
    </PageContainer>
  );
}
