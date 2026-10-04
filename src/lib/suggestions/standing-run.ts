import { formatDateTime, formatIsoDate } from "@/lib/format";
import { londonInstant } from "@/lib/rules/time";

/**
 * Standing runs (spec 6.12): orders for the run's regular sites received
 * before the cut-off on the run day are suggested onto that day's draft load.
 * Later ones are listed separately, so the planner can still choose to add them.
 */

export type RunOrderCandidate = {
  id: string;
  order_ref: string;
  customer_name: string;
  site_id: string;
  site_name: string;
  required_date: string;
  created_at: string;
};

export type StandingRunSuggestion = {
  runName: string;
  cutoff: string;
  /** In the run's usual site order. */
  orders: (RunOrderCandidate & { reason: string })[];
  /** Received after the cut-off: not suggested, but shown. */
  late: (RunOrderCandidate & { reason: string })[];
};

export function standingRunOrders(
  run: { name: string; cutoff: string; siteIds: string[] },
  loadDate: string,
  candidates: RunOrderCandidate[],
): StandingRunSuggestion {
  const cutoffAt = londonInstant(loadDate, run.cutoff).getTime();
  const position = (siteId: string) => run.siteIds.indexOf(siteId);
  const ordered = candidates
    .filter((c) => position(c.site_id) >= 0)
    .sort(
      (a, b) =>
        position(a.site_id) - position(b.site_id) ||
        a.required_date.localeCompare(b.required_date) ||
        a.order_ref.localeCompare(b.order_ref),
    );
  const onTime = ordered
    .filter((c) => new Date(c.created_at).getTime() <= cutoffAt)
    .map((c) => ({
      ...c,
      reason: `For ${c.site_name}, a regular stop on ${run.name}; received ${formatDateTime(c.created_at)}, before the ${run.cutoff} cut-off. Needed ${formatIsoDate(c.required_date)}.`,
    }));
  const late = ordered
    .filter((c) => new Date(c.created_at).getTime() > cutoffAt)
    .map((c) => ({
      ...c,
      reason: `Received ${formatDateTime(c.created_at)}, after the ${run.cutoff} cut-off.`,
    }));
  return { runName: run.name, cutoff: run.cutoff, orders: onTime, late };
}
