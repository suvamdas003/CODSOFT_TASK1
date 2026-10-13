/**
 * Calendar dates (attendance day, due date, date of birth) are stored as PostgreSQL
 * DATE values, which Prisma represents as a JS Date at 00:00 UTC. All conversions
 * below work in UTC so a date never shifts by a day because of the server time zone.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyString(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function parseDateOnly(value: string): Date {
  if (!isDateOnlyString(value)) throw new RangeError(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** "YYYY-MM-DD" for a stored DATE value (for <input type="date">). */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date as YYYY-MM-DD in the given IANA time zone (default: server zone). */
export function todayDateOnlyString(timeZone?: string): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function todayDateOnly(): Date {
  return parseDateOnly(todayDateOnlyString());
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function formatDate(date: Date | null | undefined, locale = "en-US"): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function formatDateTime(date: Date | null | undefined, locale = "en-US"): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
