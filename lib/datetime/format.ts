import { format } from "date-fns";
import type { CalendarView } from "@/lib/types";
import { getVisibleDays } from "@/lib/datetime/window";

/** Human label for the current view + focused date (e.g. "Jun 1 – 7, 2026"). */
export function formatRangeLabel(view: CalendarView, focusedMs: number): string {
  if (view === "day") return format(focusedMs, "EEEE, MMM d, yyyy");
  if (view === "month") return format(focusedMs, "MMMM yyyy");

  const days = getVisibleDays("week", focusedMs);
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

export function parseViewParam(value: string | undefined): CalendarView {
  return value === "month" || value === "day" ? value : "week";
}
