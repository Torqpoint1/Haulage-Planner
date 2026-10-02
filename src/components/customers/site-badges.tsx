import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { siteRestrictions, type Freshness, type SiteRules } from "@/lib/customers/sites";

/** Restrictions as labelled chips; amber for anything that can stop a delivery (a "check"). */
export function RestrictionChips({ site, limit }: { site: SiteRules; limit?: number }) {
  const all = siteRestrictions(site);
  const shown = limit ? all.slice(0, limit) : all;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {shown.map((r) => (
        <Badge key={r.key} tone={r.tone === "warning" ? "warning" : "neutral"}>
          {r.label}
        </Badge>
      ))}
      {limit && all.length > limit ? <Badge>+{all.length - limit} more</Badge> : null}
    </span>
  );
}

/** Spec 7.2 SITE_INFO_STALE is an "info" warning, so stale sites show in blue. */
export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  if (freshness.stale) return <Badge tone="info">{freshness.label}</Badge>;
  return (
    <Badge tone="neutral" icon={<ShieldCheck aria-hidden />}>
      {freshness.label}
    </Badge>
  );
}
