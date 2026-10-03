import {
  Building,
  FileUp,
  Handshake,
  IdCard,
  Map,
  Package,
  Repeat,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS: { title: string; description: string; icon: LucideIcon; href?: string }[] = [
  {
    title: "Organisation & branding",
    description: "Name, logo, accent colour and timezone.",
    icon: Building,
    href: "/settings/organisation",
  },
  {
    title: "Depots",
    description: "Factories and warehouses you load from.",
    icon: Warehouse,
    href: "/settings/depots",
  },
  {
    title: "Users & roles",
    description: "Invite people and choose what they can do.",
    icon: Users,
    href: "/settings/users",
  },
  {
    title: "Handling unit types",
    description: "Pallets, stillages, door packs and how they travel.",
    icon: Package,
    href: "/settings/unit-types",
  },
  {
    title: "Vehicles",
    description: "Your fleet, capacities and unloading methods.",
    icon: Truck,
    href: "/settings/vehicles",
  },
  {
    title: "Drivers",
    description: "Licences, contact details and availability.",
    icon: IdCard,
    href: "/settings/drivers",
  },
  {
    title: "Hauliers & rate cards",
    description: "Outside hauliers, pallet networks and their prices.",
    icon: Handshake,
    href: "/settings/hauliers",
  },
  {
    title: "Postcode zones",
    description: "Group postcode areas for rates and planning.",
    icon: Map,
    href: "/settings/zones",
  },
  { title: "Standing runs", description: "Routine routes that repeat each week.", icon: Repeat },
  {
    title: "Warning thresholds",
    description: "When checks turn amber or block a load.",
    icon: SlidersHorizontal,
    href: "/settings/thresholds",
  },
  {
    title: "Compliance zones",
    description: "London and clean air zone rules.",
    icon: ShieldAlert,
    href: "/settings/compliance-zones",
  },
  {
    title: "Import/export",
    description: "Bring data in from spreadsheets, or export it all.",
    icon: FileUp,
  },
];

export default async function SettingsPage() {
  await requireArea("settings");
  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Set up once; a new customer is a setup job, never a code change."
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ title, description, icon: Icon, href }) => {
          const body = (
            <>
              <span className="flex size-control shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-muted">
                <Icon className="size-icon" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-sm text-text-muted">{description}</span>
              </span>
            </>
          );
          return (
            <li key={title} className="min-w-0">
              {href ? (
                <Link href={href} className="block h-full rounded-lg">
                  <Card interactive className="flex h-full items-start gap-4 p-4">
                    {body}
                  </Card>
                </Link>
              ) : (
                <Card className="flex h-full items-start gap-4 p-4">
                  {body}
                  <Chip className="ml-auto">Coming soon</Chip>
                </Card>
              )}
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
