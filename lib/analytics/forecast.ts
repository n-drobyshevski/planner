// Capacity forecast over an upcoming window: committed time per day, the
// busiest day, a typical-day baseline from trailing history, and open tasks
// due in the window with no scheduled block. Pure + side-effect-free; epoch
// ms, half-open [start, end) intervals; due dates are zone-free yyyy-MM-dd
// tokens judged in the viewer zone via dateInputToMs.
//
// Inputs are PRE-FILTERED by lib/insights/filters.ts (tracked + member +
// category) and already expanded over the future window. They may still
// contain inactive (sleep) occurrences when the include-inactive toggle is
// on — committed time excludes them (same rule as the suggestions engine),
// though an inactive task block still counts as "scheduled" for the
// due-unscheduled check.

import { median } from "@/lib/analytics/stats";
import { dateInputToMs } from "@/lib/datetime/local";
import type { Occurrence, TaskRow, TimeWindow } from "@/lib/types";

export interface ForecastInput {
  /** Insights-filtered occurrences, already expanded over the future window. */
  futureOccurrences: Occurrence[];
  /** Viewer-zone day starts (ms) of the future window (nextWindowOf.days). */
  futureDays: number[];
  futureWindow: TimeWindow;
  /** Trailing baseline: current + previous period perDay rows, concatenated. */
  historyPerDay: { dayMs: number; ms: number }[];
  tasks: TaskRow[];
  timeZone: string;
  /** The caller's clock anchor (the future window starts at/after it). */
  now: number;
}

export interface Forecast {
  /** committed (non-inactive) ms per future day; buckets tile the window */
  perDay: { dayMs: number; committedMs: number }[];
  /** the day with the most committed time, or null when nothing is committed */
  busiestDay: { dayMs: number; ms: number } | null;
  /** median NONZERO history day (same baseline as the overload rule) */
  typicalDayMs: number;
  /** total committed / (typicalDayMs × futureDays.length); null when
   *  typicalDayMs is 0 (no usable baseline) or the window has no days */
  capacityRatio: number | null;
  /** open top-level tasks due within the window with no scheduled block,
   *  sorted by due date (then title, for determinism) */
  dueUnscheduled: { taskId: string; title: string; dueDate: string }[];
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Forecast the upcoming window. Per-day buckets span [futureDays[i],
 * futureDays[i+1] ?? futureWindow.end) like computeUsage's perDay, so
 * multi-day occurrences split at the same boundaries and DST day lengths are
 * honoured. "Scheduled" for dueUnscheduled = ANY occurrence in the future
 * window carrying the task's id.
 */
export function computeForecast(input: ForecastInput): Forecast {
  const { futureDays, futureWindow, timeZone } = input;
  // Sleep blocks never read as commitment (see module header).
  const active = input.futureOccurrences.filter((o) => !o.inactive);

  const perDay = futureDays.map((dayMs, i) => {
    const dayEnd = i + 1 < futureDays.length ? futureDays[i + 1] : futureWindow.end;
    let committedMs = 0;
    for (const o of active) committedMs += overlap(o.start, o.end, dayMs, dayEnd);
    return { dayMs, committedMs };
  });

  const busiestDay = perDay.reduce<{ dayMs: number; ms: number } | null>(
    (best, d) =>
      d.committedMs > 0 && (best === null || d.committedMs > best.ms)
        ? { dayMs: d.dayMs, ms: d.committedMs }
        : best,
    null,
  );

  const typicalDayMs = median(
    input.historyPerDay.map((d) => d.ms).filter((ms) => ms > 0),
  );

  const totalCommittedMs = perDay.reduce((s, d) => s + d.committedMs, 0);
  const capacityRatio =
    typicalDayMs > 0 && futureDays.length > 0
      ? totalCommittedMs / (typicalDayMs * futureDays.length)
      : null;

  const scheduledTaskIds = new Set<string>();
  for (const o of input.futureOccurrences) {
    if (o.taskId !== null) scheduledTaskIds.add(o.taskId);
  }
  const dueUnscheduled = input.tasks
    .filter((t) => {
      if (t.parentId !== null || t.status === "done" || t.dueDate === null) return false;
      const dueMs = dateInputToMs(t.dueDate, timeZone);
      if (dueMs < futureWindow.start || dueMs >= futureWindow.end) return false;
      return !scheduledTaskIds.has(t.id);
    })
    .map((t) => ({ taskId: t.id, title: t.title, dueDate: t.dueDate as string }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

  return { perDay, busiestDay, typicalDayMs, capacityRatio, dueUnscheduled };
}
