import { ClipboardList, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  await requireArea("orders");
  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Search by order ref, PO number, delivery note, customer or postcode."
        actions={
          <>
            <Button variant="secondary" disabled title="CSV import arrives with orders">
              <Upload aria-hidden />
              Import CSV
            </Button>
            <Button variant="primary" disabled title="Add customers first">
              <Plus aria-hidden />
              New order
            </Button>
          </>
        }
      />
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No orders yet"
          description="Add orders one at a time or import them from a spreadsheet. Each order is checked for readiness, site restrictions and capacity when you plan it."
        />
      </Card>
    </PageContainer>
  );
}
