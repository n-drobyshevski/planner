// View windowing using date-fns, evaluated in an explicit IANA time zone
// (defaults to the host/device zone). All times are epoch milliseconds
// (UTC-based). Windows are half-open [start, end).

import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  getTime,
} from "date-fns";
import { tz } from "@date-fns/tz";
import { localTimeZone } from "@/lib/datetime/local";
import type { CalendarView, TimeWindow } from "@/lib/types";

type WeekStartsOn = 0 | 1;

interface WindowOpts {
  weekStartsOn?: WeekStartsOn;
  /** IANA zone the day/week/month boundaries are computed in (default: device). */
  timeZone?: string;
}

const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/** Days shown in the Agenda (Schedule) view window; navigated as one page. */
export const AGENDA_DAYS = 30;

function resolveWeekStart(opts?: WindowOpts): WeekStartsOn {
  return opts?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
}

function resolveZone(opts?: WindowOpts): string {
  return opts?.timeZone ?? localTimeZone();
}

/**
 * Compute the half-open [start, end) window (epoch ms) for a calendar view
 * focused on `focusedMs`, with day boundaries landing on local midnight in the
 * resolved zone.
 *
 * - day:   [startOfDay(focused), +1 day)
 * - 3day:  [startOfDay(focused), +3 days) — focused day is the leftmost column
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
  const ctx = tz(resolveZone(opts));

  switch (view) {
    case "day": {
      const start = startOfDay(focusedMs, { in: ctx });
      const end = addDays(start, 1, { in: ctx });
      return { start: getTime(start), end: getTime(end) };
    }
    case "week": {
      const start = startOfWeek(focusedMs, { weekStartsOn, in: ctx });
      const end = addDays(start, 7, { in: ctx });
      return { start: getTime(start), end: getTime(end) };
    }
    case "3day": {
      // Rolling window: the focused day is the leftmost of 3 columns.
      const start = startOfDay(focusedMs, { in: ctx });
      const end = addDays(start, 3, { in: ctx });
      return { start: getTime(start), end: getTime(end) };
    }
    case "month": {
      const gridStart = startOfWeek(startOfMonth(focusedMs, { in: ctx }), {
        weekStartsOn,
        in: ctx,
      });
      const end = addDays(gridStart, 42, { in: ctx });
      return { start: getTime(gridStart), end: getTime(end) };
    }
    case "agenda": {
      // Rolling list window: the focused day forward for AGENDA_DAYS days.
      const start = startOfDay(focusedMs, { in: ctx });
      const end = addDays(start, AGENDA_DAYS, { in: ctx });
      return { start: getTime(start), end: getTime(end) };
    }
  }
}

/**
 * Return the startOfDay epoch-ms for each visible day of the view (local
 * midnight in the resolved zone):
 * day => 1 entry, 3day => 3 entries, week => 7 entries, month => 42 entries.
 */
export function getVisibleDays(
  view: CalendarView,
  focusedMs: number,
  opts?: WindowOpts,
): number[] {
  const { start } = getWindow(view, focusedMs, opts);
  const ctx = tz(resolveZone(opts));
  const count =
    view === "day"
      ? 1
      : view === "3day"
        ? 3
        : view === "week"
          ? 7
          : view === "agenda"
            ? AGENDA_DAYS
            : 42;

  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Re-normalize via startOfDay so DST day boundaries land on local midnight.
    days.push(getTime(startOfDay(addDays(start, i, { in: ctx }), { in: ctx })));
  }
  return days;
}

/**
 * The startOfDay-aligned ms that a "New event" (the header "+" or a month-cell
 * create) should default to for the current view: month -> the 1st of the
 * focused month; every other view -> the first visible day (week => Monday).
 */
export function defaultCreateDay(
  view: CalendarView,
  focusedMs: number,
  opts?: WindowOpts,
): number {
  // For month, getVisibleDays[0] is the grid start (can be in the previous
  // month), so default to the actual 1st instead.
  if (view === "month")
    return getTime(startOfMonth(focusedMs, { in: tz(resolveZone(opts)) }));
  return getVisibleDays(view, focusedMs, opts)[0];
}

/**
 * Navigate the focused day by one unit of the view in direction `dir`.
 * day => +/-1 day, 3day => +/-3 days, week => +/-1 week, month => +/-1 month;
 * dir 0 unchanged.
 * Returns the resulting startOfDay epoch-ms (local midnight in the resolved zone).
 */
export function navigate(
  view: CalendarView,
  focusedMs: number,
  dir: -1 | 0 | 1,
  opts?: WindowOpts,
): number {
  const ctx = tz(resolveZone(opts));
  const base = startOfDay(focusedMs, { in: ctx });

  let next: Date | number;
  switch (view) {
    case "day":
      next = addDays(base, dir, { in: ctx });
      break;
    case "week":
      next = addWeeks(base, dir, { in: ctx });
      break;
    case "3day":
      next = addDays(base, 3 * dir, { in: ctx });
      break;
    case "month":
      next = addMonths(base, dir, { in: ctx });
      break;
    case "agenda":
      next = addDays(base, AGENDA_DAYS * dir, { in: ctx });
      break;
  }

  return getTime(startOfDay(next, { in: ctx }));
}
