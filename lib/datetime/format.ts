import { format } from "date-fns";
import type { CalendarView } from "@/lib/types";
import { getVisibleDays } from "@/lib/datetime/window";

/** Human label for the current view + focused date (e.g. "Jun 1 – 7, 2026"). */
export function formatRangeLabel(view: CalendarView, focusedMs: number): string {
  if (view === "day") return format(focusedMs, "EEEE, MMM d, yyyy");
  if (view === "month") return format(focusedMs, "MMMM yyyy");
  // Agenda is a rolling list from the focused day — label it by that month.
  if (view === "agenda") return format(focusedMs, "MMMM yyyy");

  // Range views (week, 3day): span the actual visible days.
  const days = getVisibleDays(view, focusedMs);
  const start = days[0];
  const end = days[days.length - 1];
  const sameMonth = format(start, "MMM") === format(end, "MMM");
  const left = format(start, "MMM d");
  const right = sameMonth ? format(end, "d, yyyy") : format(end, "MMM d, yyyy");
  return `${left} – ${right}`;
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
