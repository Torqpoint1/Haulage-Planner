import { CalendarDays, PackageCheck } from "lucide-react";
import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/session";
import Link from "next/link";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateLong } from "@/lib/format";

export const metadata: Metadata = { title: "Warehouse" };

export default async function WarehousePage() {
  await requireArea("warehouse");
  await connection(); // "today" must be worked out per request
  return (
    <PageContainer>
      <PageHeader title="Warehouse" description={`Pick sheets for ${formatDateLong(new Date())}`} />
      <Card>
        <EmptyState
          icon={PackageCheck}
          title="Nothing to pick today"
          description="When loads are planned, each gets a pick sheet in load order (last drop first) with tick boxes for picked and loaded."
          action={
            <Button asChild>
              <Link href="/plan">
                <CalendarDays aria-hidden />
                Open plan
              </Link>
            </Button>
          }
        />
      </Card>
    </PageContainer>
  );
}
