import { Download, ExternalLink, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/session";
import { FILE_LINK_DAYS } from "@/lib/data-protection/links";
import { createClient } from "@/lib/supabase/server";
import { DeletionRequest } from "./deletion-request";

export const metadata: Metadata = { title: "Your data" };

const IMPORTS = [
  { label: "Orders", href: "/orders/import" },
  { label: "Customers and sites", href: "/customers/import" },
  { label: "Vehicles", href: "/settings/vehicles/import" },
];

export default async function DataPage() {
  const session = await requireArea("settings");
  await connection();
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("deletion_requests")
    .select("id, created_at, reason")
    .eq("status", "requested")
    .maybeSingle();
  const legal = [
    { label: "Privacy notice", href: process.env.PRIVACY_NOTICE_URL },
    { label: "Data processing terms", href: process.env.DATA_PROCESSING_TERMS_URL },
  ];

  return (
    <PageContainer>
      <SettingsHeader
        title="Your data"
        description="Bring data in from spreadsheets, take a full copy away, and manage your organisation's data under UK GDPR."
      />

      <Card>
        <CardHeader className="flex-col justify-start gap-1">
          <CardTitle>Import from spreadsheets</CardTitle>
          <CardDescription>
            Upload a CSV, match its columns, and check every row before anything is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {IMPORTS.map((i) => (
            <Button key={i.href} asChild>
              <Link href={i.href}>
                <FileUp aria-hidden />
                {i.label}
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col justify-start gap-1">
          <CardTitle>Export everything</CardTitle>
          <CardDescription>
            One file with all of {session.membership.organisation.name}&rsquo;s data: settings,
            customers, orders, loads, proof of delivery, assets and the change history. Stored files
            (logo, documents, signatures, photos) are listed with download links that last{" "}
            {FILE_LINK_DAYS} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="primary">
            <a href="/settings/data/export" download>
              <Download aria-hidden />
              Download all data (JSON)
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col justify-start gap-1">
          <CardTitle>Privacy and data processing</CardTitle>
          <CardDescription>
            Personal data (contacts, drivers, signatures) is only ever visible to your organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2" aria-label="Privacy documents">
            {legal.map((l) => (
              <li key={l.label} className="flex flex-wrap items-center gap-2 text-sm">
                {l.href ? (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                  >
                    {l.label}
                    <ExternalLink className="size-icon-sm" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <>
                    <span className="font-medium">{l.label}</span>
                    <span className="text-text-muted">Not published yet</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <DeletionRequest
        organisationName={session.membership.organisation.name}
        request={request ?? null}
      />
    </PageContainer>
  );
}
