import { format, startOfDay, getTime } from "date-fns";
import { tz, TZDate } from "@date-fns/tz";

const DAY_MS = 86_400_000;

/** Browser IANA time zone (fallback UTC). The default zone for the helpers below. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** epoch ms -> "yyyy-MM-dd" in `timeZone` for <input type="date">. */
export function msToDateInput(ms: number, timeZone: string = localTimeZone()): string {
  return format(ms, "yyyy-MM-dd", { in: tz(timeZone) });
}

/** epoch ms -> "HH:mm" in `timeZone` for <input type="time">. */
export function msToTimeInput(ms: number, timeZone: string = localTimeZone()): string {
  return format(ms, "HH:mm", { in: tz(timeZone) });
}

/** Parse "yyyy-MM-dd" + "HH:mm" wall-clock as an instant in `timeZone`. */
export function combineDateTime(
  dateStr: string,
  timeStr: string,
  timeZone: string = localTimeZone(),
): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = (timeStr || "00:00").split(":").map(Number);
  // TZDate's month arg is 0-based (mirrors lib/recurrence/expand.ts).
  return new TZDate(y, mo - 1, d, h, mi, 0, timeZone).getTime();
}

/** Start-of-day instant for a date string, interpreted in `timeZone`. */
export function dateInputToMs(dateStr: string, timeZone: string = localTimeZone()): number {
  return combineDateTime(dateStr, "00:00", timeZone);
}

/**
 * Start-of-day instant for an all-day date, anchored to UTC midnight so the
 * stored value is a zone-independent calendar-date token (floating all-day:
 * "June 2" reads as June 2 for every viewer). Pair with `allDayDateKey` on read.
 */
export function dateInputToUtcMs(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, mo - 1, d);
}

/** The zone-independent calendar-date key (UTC) of an all-day instant. */
export function allDayDateKey(ms: number): string {
  return format(ms, "yyyy-MM-dd", { in: tz("UTC") });
}

/** The calendar-date key of a day column / instant, read in `timeZone`. */
export function dateKeyInZone(ms: number, timeZone: string = localTimeZone()): string {
  return format(ms, "yyyy-MM-dd", { in: tz(timeZone) });
}

/** Whether a zone-free "yyyy-MM-dd" token is before today, judged in `timeZone`. */
export function isDateTokenPast(dateStr: string, timeZone: string = localTimeZone()): boolean {
  return dateStr < dateKeyInZone(Date.now(), timeZone);
}

/**
 * Local day-start `offset` days after the day containing `ms` (negative =
 * before). TZDate normalizes out-of-range days, and a DST-transition day
 * keeps its wall-clock midnight.
 */
export function dayStartOffset(ms: number, offset: number, timeZone: string): number {
  const [y, mo, d] = dateKeyInZone(ms, timeZone).split("-").map(Number);
  return new TZDate(y, mo - 1, d + offset, 0, 0, 0, timeZone).getTime();
}

export const DAY_IN_MS = DAY_MS;

/** Round a timestamp up to the next `stepMin` boundary (for sensible defaults). */
export function ceilToStep(ms: number, stepMin: number): number {
  const step = stepMin * 60_000;
  return Math.ceil(ms / step) * step;
}

/**
 * Default start instant for a new event defaulted to a whole day: if `dayMs` is
 * today (in `timeZone`), the next 30-minute slot from `now`; otherwise 9:00
 * local on that day. The caller adds the duration. `now` is injectable for tests.
 *
 * Edge: late at night `ceilToStep` can roll to 00:00 the next day — the same
 * accepted behavior as the event dialog's buildInitial fallback.
 */
export function defaultStartOnDay(
  dayMs: number,
  timeZone: string = localTimeZone(),
  now: number = Date.now(),
): number {
  return dayMs === getTime(startOfDay(now, { in: tz(timeZone) }))
    ? ceilToStep(now, 30)
    : dayMs + 9 * 3_600_000;
}
