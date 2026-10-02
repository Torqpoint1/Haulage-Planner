import { format as formatFns } from "date-fns";
import { enGB } from "date-fns/locale";

/**
 * UK formatting conventions (spec section 0, rule 8): dd/mm/yyyy dates,
 * 24-hour times, kg, mm/metres, miles, £, Europe/London timezone.
 *
 * Always format through these helpers rather than calling toLocaleString
 * directly, so every screen shows figures the same way.
 */

export const TIMEZONE = "Europe/London";
export const LOCALE = "en-GB";

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const londonPartsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/**
 * The London wall-clock time as a local Date, so date-fns can format it.
 * Browsers and Node ship different locale data (e.g. "Sept" vs "Sep"), so
 * word-based formats go through date-fns to render identically everywhere.
 */
function londonWallClock(value: DateInput): Date {
  const parts = Object.fromEntries(
    londonPartsFmt.formatToParts(toDate(value)).map((p) => [p.type, p.value]),
  );
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
}

/** 01/10/2026 */
export function formatDate(value: DateInput): string {
  return dateFmt.format(toDate(value));
}

/** 14:05 */
export function formatTime(value: DateInput): string {
  return timeFmt.format(toDate(value));
}

/** 01/10/2026 14:05 */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** Thu 1 Oct */
export function formatDayShort(value: DateInput): string {
  return formatFns(londonWallClock(value), "EEE d MMM", { locale: enGB });
}

/** Thursday 1 October 2026 */
export function formatDateLong(value: DateInput): string {
  return formatFns(londonWallClock(value), "EEEE d MMMM yyyy", { locale: enGB });
}

/**
 * Parse a UK date typed by a person (dd/mm/yyyy, also accepting d/m/yy and
 * `-` or `.` separators). Returns a local Date at midnight, or null.
 */
export function parseUkDate(input: string): Date | null {
  const match = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(input);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += 2000;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Format a local calendar date (no timezone shift) as dd/mm/yyyy. */
export function formatLocalDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDpFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const gbpFmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "GBP" });
const gbpWholeFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** 1,250 kg */
export function formatKg(kg: number): string {
  return `${intFmt.format(kg)} kg`;
}

/** 2,400 mm */
export function formatMm(mm: number): string {
  return `${intFmt.format(mm)} mm`;
}

/** 4.2 m */
export function formatMetres(m: number): string {
  return `${oneDpFmt.format(m)} m`;
}

/** 31 miles, 1 mile, 0.4 miles */
export function formatMiles(miles: number): string {
  const rounded = miles < 10 ? oneDpFmt.format(miles) : intFmt.format(miles);
  return `${rounded} ${rounded === "1" ? "mile" : "miles"}`;
}

/** £1,234.50, or £1,235 when `whole` is set */
export function formatGbp(amount: number, { whole = false } = {}): string {
  return (whole ? gbpWholeFmt : gbpFmt).format(amount);
}

/** 87% */
export function formatPercent(fraction: number): string {
  return `${intFmt.format(fraction * 100)}%`;
}

/** 1,234 */
export function formatNumber(n: number): string {
  return intFmt.format(n);
}

/** "1 drop", "3 drops" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Today's calendar date in Europe/London as yyyy-mm-dd, whatever timezone
 * the server or browser is in. Pass this from server to client components
 * so both agree on "today".
 */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

/** Turn a yyyy-mm-dd string into a local Date at midnight (a calendar date). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A local Date as yyyy-mm-dd (a calendar date, no timezone shift). */
export function toIsoDate(date: Date): string {
  return formatFns(date, "yyyy-MM-dd");
}

/** "01/10/2026" for a yyyy-mm-dd calendar date. */
export const formatIsoDate = (iso: string) => formatLocalDate(fromIsoDate(iso));

/** "Thu 1 Oct" for a calendar date (no timezone shift). */
export function formatLocalDayShort(date: Date): string {
  return formatFns(date, "EEE d MMM", { locale: enGB });
}
