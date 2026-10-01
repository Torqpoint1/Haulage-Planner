import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireArea("customers");
  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Customers, their delivery sites, contacts and site restrictions."
        actions={
          <Button variant="primary" disabled title="Available once accounts are set up">
            <Plus aria-hidden />
            New customer
          </Button>
        }
      />
      <Card>
        <EmptyState
          icon={Building2}
          title="No customers yet"
          description="Record each site's access, unloading equipment and booking rules once, and they're checked automatically every time you plan a delivery."
        />
      </Card>
    </PageContainer>
  );
}
