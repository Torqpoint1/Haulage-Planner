import { formatKg } from "@/lib/format";

export type LineForSummary = {
  quantity: number;
  weight_per_unit_kg: number;
  unit_type: { short_code: string; name: string } | null;
};

/** "6 DP · 2 EUR", grouping lines of the same unit type. */
export function unitsSummary(lines: LineForSummary[]): string {
  const totals = new Map<string, number>();
  for (const l of lines) {
    const code = l.unit_type?.short_code ?? "?";
    totals.set(code, (totals.get(code) ?? 0) + l.quantity);
  }
  return totals.size ? [...totals].map(([code, qty]) => `${qty} ${code}`).join(" · ") : "No lines";
}

export function totalWeightKg(
  lines: Pick<LineForSummary, "quantity" | "weight_per_unit_kg">[],
): number {
  return lines.reduce((sum, l) => sum + l.quantity * Number(l.weight_per_unit_kg), 0);
}

export const formatWeight = (lines: Pick<LineForSummary, "quantity" | "weight_per_unit_kg">[]) =>
  formatKg(Math.round(totalWeightKg(lines)));
