import { format } from "date-fns";

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
