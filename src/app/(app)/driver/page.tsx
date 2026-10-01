import { Route } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireArea } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My run" };

export default async function DriverPage() {
  await requireArea("driver");
  return (
    <PageContainer>
      <PageHeader title="My run" description="Your stops for today, in order." />
      <Card>
        <EmptyState
          icon={Route}
          title="No run assigned today"
          description="When a planner assigns you a load, your stops, contacts, delivery instructions and booking slots appear here."
        />
      </Card>
    </PageContainer>
  );
}
