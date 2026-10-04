import type { Metadata } from "next";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { requireArea } from "@/lib/auth/session";
import { londonToday } from "@/lib/format";
import { parseFilters } from "@/lib/history/filters";
import { loadHistoryChoices, searchHistory } from "@/lib/history/search";
import { HistoryNav } from "./history-nav";
import { HistorySearch } from "./history-search";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  await requireArea("history");
  await connection();
  const filters = parseFilters(await searchParams);
  const [results, choices] = await Promise.all([searchHistory(filters), loadHistoryChoices()]);
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="History"
        description="Find any delivery with its confirmation, documents and proof of delivery."
      />
      <HistoryNav />
      <HistorySearch
        key={JSON.stringify(filters)}
        filters={filters}
        results={results}
        choices={choices}
        today={londonToday()}
      />
    </PageContainer>
  );
}
