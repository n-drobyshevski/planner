import { format, formatDistanceToNow, isSameDay } from "date-fns";
import { tz } from "@date-fns/tz";
import type { CalendarView } from "@/lib/types";
import { getVisibleDays } from "@/lib/datetime/window";
import { localTimeZone, dateInputToUtcMs } from "@/lib/datetime/local";
import { dateFnsLocale } from "@/lib/datetime/date-locale";

/**
 * Every display formatter takes a trailing `locale` (the app locale, "en" |
 * "ru") and derives the date-fns locale from it, so callers only pass the string
 * they already have from `useLocale()`. English ("en") is the default and the
 * date-fns built-in, so untouched callers keep printing English.
 */

/** 24-hour time, e.g. "09:00". Locale-neutral, but kept uniform with the others. */
export function formatTime(ms: number, timeZone: string = localTimeZone()): string {
  return format(ms, "HH:mm", { in: tz(timeZone) });
}

/** Day then month, e.g. "1 Jun" / "1 июн.". */
export function formatDayMonth(
  ms: number,
  timeZone: string = localTimeZone(),
  locale = "en",
): string {
  return format(ms, "d MMM", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}

/** Day then month for a zone-free "yyyy-MM-dd" token (e.g. task due dates). */
export function formatDayMonthToken(dateStr: string, locale = "en"): string {
  return format(dateInputToUtcMs(dateStr), "d MMM", {
    in: tz("UTC"),
    locale: dateFnsLocale(locale),
  });
}

/** Weekday, day, month, e.g. "Mon, 1 Jun" / "пн, 1 июн.". */
export function formatWeekdayDayMonth(
  ms: number,
  timeZone: string = localTimeZone(),
  locale = "en",
): string {
  return format(ms, "EEE, d MMM", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}

/** Day, month, year, e.g. "1 Jun 2026" / "1 июн. 2026 г.". */
export function formatDayMonthYear(
  ms: number,
  timeZone: string = localTimeZone(),
  locale = "en",
): string {
  return format(ms, "d MMM yyyy", { in: tz(timeZone), locale: dateFnsLocale(locale) });
}

/** Human label for the current view + focused date (e.g. "25 – 31 May 2026"). */
export function formatRangeLabel(
  view: CalendarView,
  focusedMs: number,
  timeZone: string = localTimeZone(),
  locale = "en",
): string {
  const loc = dateFnsLocale(locale);
  const ctx = tz(timeZone);
  if (view === "day") return format(focusedMs, "EEEE, d MMM yyyy", { in: ctx, locale: loc });
  if (view === "month") return format(focusedMs, "MMMM yyyy", { in: ctx, locale: loc });
  // Agenda is a rolling list from the focused day — label it by that month.
  if (view === "agenda") return format(focusedMs, "MMMM yyyy", { in: ctx, locale: loc });

  // Range views (week, 3day): span the actual visible days, day-before-month.
  const days = getVisibleDays(view, focusedMs, { timeZone });
  const start = days[0];
  const end = days[days.length - 1];
  const sameMonth =
    format(start, "MMM yyyy", { in: ctx, locale: loc }) ===
    format(end, "MMM yyyy", { in: ctx, locale: loc });
  const left = sameMonth
    ? format(start, "d", { in: ctx, locale: loc })
    : format(start, "d MMM", { in: ctx, locale: loc });
  const right = format(end, "d MMM yyyy", { in: ctx, locale: loc });
  return `${left} – ${right}`;
}

/**
 * Human label for a single occurrence's date + time, for the details view:
 *  - all-day, one day:   "Mon, 1 Jun · All day"
 *  - all-day, multi-day: "1 Jun – 4 Jun"   (end is exclusive midnight)
 *  - timed, same day:    "Mon, 1 Jun · 09:00 – 09:30"
 *  - timed, across days: "1 Jun, 23:00 – 2 Jun, 01:00"
 *
 * All-day dates are rendered in UTC (floating: the same calendar date for every
 * viewer); timed instants render in the viewer's `timeZone`.
 */
export function formatOccurrenceWhen(
  start: number,
  end: number,
  allDay: boolean,
  timeZone: string = localTimeZone(),
  locale = "en",
): string {
  if (allDay) {
    const lastDay = end - 1; // exclusive end → inclusive last day
    const allDayLabel = locale === "ru" ? "Весь день" : "All day";
    return isSameDay(start, lastDay, { in: tz("UTC") })
      ? `${formatWeekdayDayMonth(start, "UTC", locale)} · ${allDayLabel}`
      : `${formatDayMonth(start, "UTC", locale)} – ${formatDayMonth(lastDay, "UTC", locale)}`;
  }
  if (isSameDay(start, end, { in: tz(timeZone) })) {
    return `${formatWeekdayDayMonth(start, timeZone, locale)} · ${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`;
  }
  return `${formatDayMonth(start, timeZone, locale)}, ${formatTime(start, timeZone)} – ${formatDayMonth(end, timeZone, locale)}, ${formatTime(end, timeZone)}`;
}

/**
 * The same occurrence label as `formatOccurrenceWhen`, split into a primary line
 * (the date) and a secondary line (the time range, or "All day") for the details
 * view's two-line "when" hero. Timed occurrences that cross midnight have no
 * clean split, so the whole label lands in `primary` and `secondary` is null.
 */
export function formatOccurrenceWhenParts(
  start: number,
  end: number,
  allDay: boolean,
  timeZone: string = localTimeZone(),
  locale = "en",
): { primary: string; secondary: string | null } {
  if (allDay) {
    const lastDay = end - 1; // exclusive end → inclusive last day
    const allDayLabel = locale === "ru" ? "Весь день" : "All day";
    const primary = isSameDay(start, lastDay, { in: tz("UTC") })
      ? formatWeekdayDayMonth(start, "UTC", locale)
      : `${formatDayMonth(start, "UTC", locale)} – ${formatDayMonth(lastDay, "UTC", locale)}`;
    return { primary, secondary: allDayLabel };
  }
  if (isSameDay(start, end, { in: tz(timeZone) })) {
    return {
      primary: formatWeekdayDayMonth(start, timeZone, locale),
      secondary: `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`,
    };
  }
  return {
    primary: `${formatDayMonth(start, timeZone, locale)}, ${formatTime(start, timeZone)} – ${formatDayMonth(end, timeZone, locale)}, ${formatTime(end, timeZone)}`,
    secondary: null,
  };
}

/**
 * Human-friendly duration from milliseconds, rounded to the nearest minute:
 * "0m", "45m", "2h", "3h 30m" (en) / "0 мин", "2 ч 30 мин" (ru). Negative input
 * clamps to zero.
 */
export function formatDuration(ms: number, locale = "en"): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ru = locale === "ru";
  const hu = ru ? " ч" : "h";
  const mu = ru ? " мин" : "m";
  if (h === 0) return `${m}${mu}`;
  if (m === 0) return `${h}${hu}`;
  return `${h}${hu} ${m}${mu}`;
}

/**
 * Relative time from now with a suffix, e.g. "2 days ago" / "2 дня назад".
 * Reads the current time, so call it only client-side (it backs "last used"
 * style labels, never prerendered chrome).
 */
export function formatRelativeToNow(ms: number, locale = "en"): string {
  return formatDistanceToNow(ms, { addSuffix: true, locale: dateFnsLocale(locale) });
}

/** URL date param helpers. `toDateParam` encodes the focused day in `timeZone`. */
export function toDateParam(ms: number, timeZone: string = localTimeZone()): string {
  return format(ms, "yyyy-MM-dd", { in: tz(timeZone) });
}

export function parseDateParam(value: string | undefined): number {
  // Runs in the server route with no member context; the coarse y-m-d seed is
  // re-normalized to the viewer's zone by getWindow on the client.
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
