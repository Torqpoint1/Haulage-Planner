import { Boxes, CalendarDays, ClipboardList, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/session";
import Link from "next/link";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGroup } from "@/components/ui/stat";
import { formatDateLong } from "@/lib/format";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  await requireArea("today");
  await connection(); // "today" must be worked out per request
  return (
    <PageContainer>
      <PageHeader
        title="Today"
        description={formatDateLong(new Date())}
        actions={
          <Button asChild variant="primary">
            <Link href="/plan">
              <CalendarDays aria-hidden />
              Open plan
            </Link>
          </Button>
        }
      />

      <StatGroup aria-label="Today at a glance">
        <Stat label="Loads" value={0} />
        <Stat label="Vehicles out" value={0} />
        <Stat label="Drops" value={0} />
        <Stat label="Overdue assets" value={0} />
      </StatGroup>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            compact
            icon={ShieldCheck}
            title="Nothing needs attention"
            description="Blocking warnings appear here first, then checks, grouped by load, each with a link to the fix."
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s loads</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              icon={Truck}
              title="No loads planned for today"
              description="Loads you plan for today will show here with their vehicle, driver, stops and capacity."
              action={
                <Button asChild>
                  <Link href="/plan">Plan a load</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Due in the next 5 working days</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              icon={ClipboardList}
              title="No orders waiting"
              description="Orders that are unplanned or not ready yet will be listed here so nothing is missed."
              action={
                <Button asChild>
                  <Link href="/orders">View orders</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-sm text-text-subtle">
        <Boxes className="size-icon-sm" aria-hidden />
        Returnable assets overdue at customer sites will be counted here.
      </p>
    </PageContainer>
  );
}
