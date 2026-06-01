import { format, isSameDay } from "date-fns";
import type { CalendarView } from "@/lib/types";
import { getVisibleDays } from "@/lib/datetime/window";

/** 24-hour time, e.g. "09:00". */
export function formatTime(ms: number): string {
  return format(ms, "HH:mm");
}

/** Day then month, e.g. "1 Jun". */
export function formatDayMonth(ms: number): string {
  return format(ms, "d MMM");
}

/** Weekday, day, month, e.g. "Mon, 1 Jun". */
export function formatWeekdayDayMonth(ms: number): string {
  return format(ms, "EEE, d MMM");
}

/** Day, month, year, e.g. "1 Jun 2026". */
export function formatDayMonthYear(ms: number): string {
  return format(ms, "d MMM yyyy");
}

/** Human label for the current view + focused date (e.g. "25 – 31 May 2026"). */
export function formatRangeLabel(view: CalendarView, focusedMs: number): string {
  if (view === "day") return format(focusedMs, "EEEE, d MMM yyyy");
  if (view === "month") return format(focusedMs, "MMMM yyyy");
  // Agenda is a rolling list from the focused day — label it by that month.
  if (view === "agenda") return format(focusedMs, "MMMM yyyy");

  // Range views (week, 3day): span the actual visible days, day-before-month.
  const days = getVisibleDays(view, focusedMs);
  const start = days[0];
  const end = days[days.length - 1];
  const sameMonth = format(start, "MMM yyyy") === format(end, "MMM yyyy");
  const left = sameMonth ? format(start, "d") : format(start, "d MMM");
  const right = format(end, "d MMM yyyy");
  return `${left} – ${right}`;
}

/**
 * Human label for a single occurrence's date + time, for the details view:
 *  - all-day, one day:   "Mon, 1 Jun · All day"
 *  - all-day, multi-day: "1 Jun – 4 Jun"   (end is exclusive midnight)
 *  - timed, same day:    "Mon, 1 Jun · 09:00 – 09:30"
 *  - timed, across days: "1 Jun, 23:00 – 2 Jun, 01:00"
 */
export function formatOccurrenceWhen(
  start: number,
  end: number,
  allDay: boolean,
): string {
  if (allDay) {
    const lastDay = end - 1; // exclusive end → inclusive last day
    return isSameDay(start, lastDay)
      ? `${formatWeekdayDayMonth(start)} · All day`
      : `${formatDayMonth(start)} – ${formatDayMonth(lastDay)}`;
  }
  if (isSameDay(start, end)) {
    return `${formatWeekdayDayMonth(start)} · ${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDayMonth(start)}, ${formatTime(start)} – ${formatDayMonth(end)}, ${formatTime(end)}`;
}

/**
 * Human-friendly duration from milliseconds, rounded to the nearest minute:
 * "0m", "45m", "2h", "3h 30m". Negative input clamps to "0m".
 */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** URL date param helpers. */
export function toDateParam(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}

export function parseDateParam(value: string | undefined): number {
  if (value) {
    const d = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

/** True when `value` is a valid calendar view (i.e. explicitly set in the URL). */
export function isCalendarViewParam(
  value: string | undefined,
): value is CalendarView {
  return (
    value === "month" ||
    value === "week" ||
    value === "day" ||
    value === "3day" ||
    value === "agenda"
  );
}

export function parseViewParam(value: string | undefined): CalendarView {
  return isCalendarViewParam(value) ? value : "week";
}
