import type { Metadata } from "next";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { londonToday } from "@/lib/format";
import { dateRange, monthRange, parseFilters } from "@/lib/history/filters";
import { loadReport } from "@/lib/reports/data";
import { HistoryNav } from "../history-nav";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/history/reports">) {
  await requireArea("history");
  await connection();
  const today = londonToday();
  const f = parseFilters(await searchParams);
  // This month so far, unless a month or dates are chosen.
  const chosen = dateRange(f);
  const from = chosen.from ?? monthRange(today.slice(0, 7)).from;
  const to = chosen.to ?? today;
  const report = await loadReport(from, to);
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="History"
        description="Reports over completed loads: cost per drop, vehicle fill, failed deliveries and haulier spend."
      />
      <HistoryNav />
      <ReportsView
        key={`${from}:${to}`}
        report={report}
        from={from}
        to={to}
        month={f.month ?? (chosen.from ? null : today.slice(0, 7))}
        today={today}
      />
    </PageContainer>
  );
}
