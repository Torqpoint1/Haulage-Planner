import { addDays, format, startOfWeek } from "date-fns";
import type { Metadata } from "next";
import { connection } from "next/server";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { fromIsoDate, londonToday } from "@/lib/format";
import { loadPlanData } from "@/lib/planning/data";
import { PlanBoard } from "./plan-board";

export const metadata: Metadata = { title: "Plan" };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const session = await requireArea("plan");
  await connection(); // "today" must be worked out per request
  const params = await searchParams;
  const today = londonToday();
  const anchor = isIso(params.week) ? params.week : today;
  const monday = startOfWeek(fromIsoDate(anchor), { weekStartsOn: 1 });
  const from = iso(monday);
  const to = iso(addDays(monday, 6));
  const data = await loadPlanData(from, to);
  const role = session.membership.role;
  const day = isIso(params.day) && params.day >= from && params.day <= to ? params.day : null;

  return (
    <PlanBoard
      data={data}
      today={today}
      nowIso={new Date().toISOString()}
      view={params.view === "day" ? "day" : "week"}
      day={day}
      weekends={params.weekend === "1"}
      selectedLoadId={typeof params.load === "string" ? params.load : null}
      canEdit={can(role, "loads.edit")}
      canApprove={can(role, "plans.approve")}
      canOverride={can(role, "warnings.override")}
    />
  );
}
