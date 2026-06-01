import { format, startOfDay, getTime } from "date-fns";

const DAY_MS = 86_400_000;

/** epoch ms -> "yyyy-MM-dd" (local) for <input type="date">. */
export function msToDateInput(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}

/** epoch ms -> "HH:mm" (local) for <input type="time">. */
export function msToTimeInput(ms: number): string {
  return format(ms, "HH:mm");
}

/** Combine a date string + time string into epoch ms (local timezone). */
export function combineDateTime(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr || "00:00"}`).getTime();
}

/** Start-of-day ms for an all-day date string (local). */
export function dateInputToMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00`).getTime();
}

export const DAY_IN_MS = DAY_MS;

/** Browser IANA time zone (fallback UTC). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Round a timestamp up to the next `stepMin` boundary (for sensible defaults). */
export function ceilToStep(ms: number, stepMin: number): number {
  const step = stepMin * 60_000;
  return Math.ceil(ms / step) * step;
}

/**
 * Default start instant for a new event defaulted to a whole day: if `dayMs` is
 * today, the next 30-minute slot from `now`; otherwise 9:00 local on that day.
 * The caller adds the duration. `now` is injectable for tests.
 *
 * Edge: late at night `ceilToStep` can roll to 00:00 the next day — the same
 * accepted behavior as the event dialog's buildInitial fallback.
 */
export function defaultStartOnDay(dayMs: number, now: number = Date.now()): number {
  return dayMs === getTime(startOfDay(now))
    ? ceilToStep(now, 30)
    : dayMs + 9 * 3_600_000;
}
