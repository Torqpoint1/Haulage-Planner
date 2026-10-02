import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, READINESS, URGENCY, optionFor } from "@/lib/orders/options";

export function ReadinessBadge({ value }: { value: string }) {
  const o = optionFor(READINESS, value);
  return <Badge tone={o.tone}>{o.label}</Badge>;
}

export function StatusBadge({ value }: { value: string }) {
  const o = optionFor(ORDER_STATUS, value);
  return <Badge tone={o.tone}>{o.label}</Badge>;
}

/** Only timed and critical orders get a badge; standard is the norm. */
export function UrgencyBadge({ value }: { value: string }) {
  if (value === "standard") return null;
  const o = optionFor(URGENCY, value);
  return (
    <Badge tone={o.tone} icon={value === "timed" ? <Clock aria-hidden /> : undefined}>
      {o.label}
    </Badge>
  );
}
