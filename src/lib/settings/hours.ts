import { DAYS } from "./options";
import type { OpeningHours } from "./schemas";

/** "Mon–Fri 07:00–17:00; Sat 08:00–12:00" */
export function summariseHours(hours: OpeningHours): string {
  const groups: { from: number; to: number; span: string }[] = [];
  DAYS.forEach(({ value }, index) => {
    const h = hours[value];
    if (!h) return;
    const span = `${h.open}–${h.close}`;
    const last = groups[groups.length - 1];
    if (last && last.span === span && last.to === index - 1) last.to = index;
    else groups.push({ from: index, to: index, span });
  });
  if (!groups.length) return "No opening hours set";
  const day = (i: number) => DAYS[i].label.slice(0, 3);
  return groups
    .map((g) => {
      const days =
        g.from === g.to
          ? day(g.from)
          : g.to === g.from + 1
            ? `${day(g.from)}, ${day(g.to)}`
            : `${day(g.from)}–${day(g.to)}`;
      return `${days} ${g.span}`;
    })
    .join("; ");
}
