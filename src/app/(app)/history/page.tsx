import { History, Search } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <PageContainer>
      <PageHeader
        title="History"
        description="Find any past delivery with its confirmation, documents and proof of delivery."
      />
      <Input
        leadingIcon={<Search />}
        placeholder="Customer, site, order ref, PO, delivery note, vehicle, driver or haulier"
        aria-label="Search history"
        disabled
      />
      <Card>
        <EmptyState
          icon={History}
          title="No deliveries yet"
          description="Completed loads are kept here so you can answer “what did we send this customer in March?” with one search."
        />
      </Card>
    </PageContainer>
  );
}
