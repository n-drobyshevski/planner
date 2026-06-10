// Time-usage analytics over a calendar window. Pure + side-effect-free so the
// numbers stay unit-testable. Times are epoch ms (UTC); windows are half-open
// [start, end).
//
// Only "tracked" time counts: normal timed events the user actually does.
// Excluded are all-day events (24h+ would swamp totals), inactive/grayed-out
// blocks (e.g. sleep), and `kind: "context"` backdrops (summing them with their
// child events would double-count). Callers pass the already visibility-filtered
// occurrence set (the calendar's `visible`); this module drops the untracked ones.

import type { Occurrence, TimeWindow } from "@/lib/types";

export interface DayUsage {
  /** start-of-day epoch ms (matches a getVisibleDays entry) */
  dayMs: number;
  /** tracked ms attributed to this day */
  ms: number;
}

export interface CategoryUsage {
  /** null = uncategorized */
  categoryId: string | null;
  ms: number;
}

export interface MemberUsage {
  ownerId: string;
  ms: number;
}

export interface UsageSummary {
  /** total tracked ms across the window */
  totalMs: number;
  /** number of tracked occurrences with > 0 ms inside the window */
  eventCount: number;
  /** number of days in the range with any tracked time */
  activeDays: number;
  /** totalMs / number of days in the range (0 when the range has no days) */
  dailyAverageMs: number;
  /** the day with the most tracked time, or null when nothing is tracked */
  busiestDay: DayUsage | null;
}

export interface Usage {
  summary: UsageSummary;
  perDay: DayUsage[];
  byCategory: CategoryUsage[];
  byMember: MemberUsage[];
}

/**
 * Tracked = a normal timed event the user actually does (see module note).
 * `includeInactive` opts grayed-out blocks (e.g. sleep) back in — the Insights
 * views expose this as a toggle; all-day and context stay excluded regardless.
 */
export function isTracked(o: Occurrence, includeInactive = false): boolean {
  return o.kind === "event" && !o.allDay && (includeInactive || !o.inactive);
}

/** Overlap (ms, ≥ 0) of half-open [aStart, aEnd) with [bStart, bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Aggregate tracked time over a window.
 *
 * @param occurrences  visibility-filtered occurrences (the calendar's `visible`);
 *                     untracked ones are dropped here.
 * @param days         consecutive start-of-day ms for the window (getVisibleDays).
 *                     Per-day buckets span [days[i], days[i+1] ?? window.end) so DST
 *                     day lengths are honoured and the last bucket is capped by the
 *                     window. Since these windows are day-aligned, the buckets tile
 *                     the window exactly, so Σ perDay.ms === summary.totalMs.
 * @param window       the focused [start, end) window; all totals are clipped to it.
 */
export function computeUsage(
  occurrences: Occurrence[],
  days: number[],
  window: TimeWindow,
  opts?: { includeInactive?: boolean },
): Usage {
  const includeInactive = opts?.includeInactive ?? false;
  const tracked = occurrences.filter((o) => isTracked(o, includeInactive));

  const perDay: DayUsage[] = days.map((dayMs, i) => {
    const dayEnd = i + 1 < days.length ? days[i + 1] : window.end;
    let ms = 0;
    for (const o of tracked) ms += overlap(o.start, o.end, dayMs, dayEnd);
    return { dayMs, ms };
  });

  const byCategoryMap = new Map<string | null, number>();
  const byMemberMap = new Map<string, number>();
  let totalMs = 0;
  let eventCount = 0;
  for (const o of tracked) {
    const ms = overlap(o.start, o.end, window.start, window.end);
    if (ms <= 0) continue;
    totalMs += ms;
    eventCount += 1;
    byCategoryMap.set(o.categoryId, (byCategoryMap.get(o.categoryId) ?? 0) + ms);
    byMemberMap.set(o.ownerId, (byMemberMap.get(o.ownerId) ?? 0) + ms);
  }

  const byCategory: CategoryUsage[] = [...byCategoryMap.entries()]
    .map(([categoryId, ms]) => ({ categoryId, ms }))
    .sort((a, b) => b.ms - a.ms);
  const byMember: MemberUsage[] = [...byMemberMap.entries()]
    .map(([ownerId, ms]) => ({ ownerId, ms }))
    .sort((a, b) => b.ms - a.ms);

  const activeDays = perDay.filter((d) => d.ms > 0).length;
  const busiestDay = perDay.reduce<DayUsage | null>(
    (best, d) => (d.ms > 0 && (best === null || d.ms > best.ms) ? d : best),
    null,
  );
  const dailyAverageMs = days.length > 0 ? totalMs / days.length : 0;

  return {
    summary: { totalMs, eventCount, activeDays, dailyAverageMs, busiestDay },
    perDay,
    byCategory,
    byMember,
  };
}
