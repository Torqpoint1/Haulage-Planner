import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SettingsHeader } from "@/components/settings/settings-header";
import { PageContainer } from "@/components/shell/page";
import { Card, CardContent } from "@/components/ui/card";
import { requireArea } from "@/lib/auth/session";
import { londonToday } from "@/lib/format";
import { HAULIER_SERVICES, HAULIER_TYPES, labelFor } from "@/lib/settings/options";
import { createClient } from "@/lib/supabase/server";
import { Rating } from "../hauliers-manager";
import { RateCardsManager, type RateCard, type ZoneOption } from "./rate-cards-manager";

export const metadata: Metadata = { title: "Haulier" };

export default async function HaulierPage({ params }: PageProps<"/settings/hauliers/[id]">) {
  await requireArea("settings");
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: haulier }, { data: cards }, { data: zones }] = await Promise.all([
    supabase.from("hauliers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("rate_cards")
      .select(
        "*, pallet_prices:rate_card_pallet_prices(zone_id, pallet_size, price), load_prices:rate_card_load_prices(zone_id, load_type, price)",
      )
      .eq("haulier_id", id)
      .order("valid_from", { ascending: false }),
    supabase.from("postcode_zones").select("id, name, colour_tag, postcode_areas").order("name"),
  ]);
  if (!haulier) notFound();

  const detail = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{value}</dd>
    </div>
  );

  return (
    <PageContainer>
      <SettingsHeader
        title={haulier.name}
        description={labelFor(HAULIER_TYPES, haulier.haulier_type)}
        backHref="/settings/hauliers"
        backLabel="Hauliers & rate cards"
      />
      <Card>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {detail(
              "Contact",
              [haulier.contact_name, haulier.phone, haulier.email].filter(Boolean).join(" · ") ||
                "Not recorded",
            )}
            {detail(
              "Covers",
              haulier.coverage_areas.length
                ? haulier.coverage_areas.join(", ")
                : "Nationwide / not set",
            )}
            {detail(
              "Services",
              haulier.services.length
                ? (haulier.services as string[])
                    .map((s) => labelFor(HAULIER_SERVICES, s))
                    .join(", ")
                : "None recorded",
            )}
            {detail("Your rating", <Rating value={haulier.rating} />)}
          </dl>
        </CardContent>
      </Card>
      <section aria-labelledby="rate-cards-heading" className="flex flex-col gap-4">
        <h2 id="rate-cards-heading" className="text-base font-semibold">
          Rate cards
        </h2>
        <RateCardsManager
          haulierId={haulier.id}
          rows={(cards ?? []) as RateCard[]}
          zones={(zones ?? []) as ZoneOption[]}
          today={londonToday()}
        />
      </section>
    </PageContainer>
  );
}
