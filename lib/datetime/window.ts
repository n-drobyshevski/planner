// View windowing using date-fns in the host local timezone.
// All times are epoch milliseconds (UTC-based). Windows are half-open [start, end).

import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  getTime,
} from "date-fns";
import type { CalendarView, TimeWindow } from "@/lib/types";

type WeekStartsOn = 0 | 1;

interface WindowOpts {
  weekStartsOn?: WeekStartsOn;
}

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

function resolveWeekStart(opts?: WindowOpts): WeekStartsOn {
  return opts?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
}

/**
 * Compute the half-open [start, end) window (epoch ms) for a calendar view
 * focused on `focusedMs`.
 *
 * - day:   [startOfDay(focused), +1 day)
 * - week:  [startOfWeek(focused, {weekStartsOn}), +7 days)
 * - month: gridStart = startOfWeek(startOfMonth(focused), {weekStartsOn});
 *          [gridStart, +42 days)
 */
export function getWindow(
  view: CalendarView,
  focusedMs: number,
  opts?: WindowOpts,
): TimeWindow {
  const weekStartsOn = resolveWeekStart(opts);

  switch (view) {
    case "day": {
      const start = startOfDay(focusedMs);
      const end = addDays(start, 1);
      return { start: getTime(start), end: getTime(end) };
    }
    case "week": {
      const start = startOfWeek(focusedMs, { weekStartsOn });
      const end = addDays(start, 7);
      return { start: getTime(start), end: getTime(end) };
    }
    case "month": {
      const gridStart = startOfWeek(startOfMonth(focusedMs), { weekStartsOn });
      const end = addDays(gridStart, 42);
      return { start: getTime(gridStart), end: getTime(end) };
    }
  }
}

/**
 * Return the startOfDay epoch-ms for each visible day of the view:
 * day => 1 entry, week => 7 entries, month => 42 entries.
 */
export function getVisibleDays(
  view: CalendarView,
  focusedMs: number,
  opts?: WindowOpts,
): number[] {
  const { start } = getWindow(view, focusedMs, opts);
  const count = view === "day" ? 1 : view === "week" ? 7 : 42;

  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Re-normalize via startOfDay so DST day boundaries land on local midnight.
    days.push(getTime(startOfDay(addDays(start, i))));
  }
  return days;
}

/**
 * Navigate the focused day by one unit of the view in direction `dir`.
 * day => +/-1 day, week => +/-1 week, month => +/-1 month; dir 0 unchanged.
 * Returns the resulting startOfDay epoch-ms.
 */
export function navigate(
  view: CalendarView,
  focusedMs: number,
  dir: -1 | 0 | 1,
  // opts kept for signature symmetry; navigation steps do not depend on it.
  _opts?: WindowOpts,
): number {
  const base = startOfDay(focusedMs);

  let next: Date | number;
  switch (view) {
    case "day":
      next = addDays(base, dir);
      break;
    case "week":
      next = addWeeks(base, dir);
      break;
    case "month":
      next = addMonths(base, dir);
      break;
  }

  return getTime(startOfDay(next));
}
