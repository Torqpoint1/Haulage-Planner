import { Badge, type StatusTone } from "@/components/ui/badge";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/assets/options";
import { plural } from "@/lib/format";

/** Where an asset is, or how overdue it is (amber: a check, not a block). */
export function AssetStatusBadge({
  status,
  daysOverdue,
}: {
  status: AssetStatus;
  daysOverdue: number;
}) {
  if (daysOverdue > 0) return <Badge tone="warning">Overdue {plural(daysOverdue, "day")}</Badge>;
  const s = ASSET_STATUSES.find((x) => x.value === status)!;
  return <Badge tone={s.tone as StatusTone}>{s.label}</Badge>;
}
