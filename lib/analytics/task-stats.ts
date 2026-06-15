// Task throughput stats for the Insights views. Pure + side-effect-free;
// epoch ms, half-open [start, end) windows.
//
// Only TOP-LEVEL tasks count (`parentId === null`) — subtasks are checklist
// items of their parent and would double-count throughput. The UI repeats
// this in a hint next to the numbers.
//
// Due dates are zone-free "yyyy-MM-dd" tokens (see TaskRow.dueDate); they are
// interpreted in the viewer's zone here, matching how the tasks views judge
// overdue.

import { dateInputToMs, dateKeyInZone } from "@/lib/datetime/local";
import type { TaskRow, TimeWindow } from "@/lib/types";
import type { Bucket } from "@/lib/insights/period";

export interface TaskStats {
  /** top-level tasks created inside the window */
  createdCount: number;
  /** top-level tasks completed inside the window */
  completedCount: number;
  /** top-level tasks whose due day falls inside the window */
  dueCount: number;
  /** share of those due that were completed on or before their due day;
   *  null when nothing was due */
  adherenceRate: number | null;
  /** open tasks whose due day is fully past as of `now` (any due date,
   *  not just in-window — it's a present-state health number) */
  overdueOpenCount: number;
  /** share of tasks created in the window that are completed by now;
   *  null when none were created */
  completionRate: number | null;
  /** median createdAt → completedAt of window completions; null when none */
  medianLeadTimeMs: number | null;
}

export interface VelocityPoint {
  start: number;
  end: number;
  created: number;
  completed: number;
}

export interface CollectionStats {
  /** null = tasks outside any collection */
  collectionId: string | null;
  createdCount: number;
  completedCount: number;
  dueCount: number;
  overdueOpenCount: number;
}

const inWindow = (ms: number | null, win: TimeWindow): boolean =>
  ms != null && ms >= win.start && ms < win.end;

const topLevel = (tasks: TaskRow[]): TaskRow[] =>
  tasks.filter((t) => t.parentId === null);

/** Whether the task's due day lies inside the window (viewer zone). */
function dueInWindow(t: TaskRow, win: TimeWindow, timeZone: string): boolean {
  if (t.dueDate === null) return false;
  const dayStart = dateInputToMs(t.dueDate, timeZone);
  return dayStart >= win.start && dayStart < win.end;
}

/** Completed on or before the due day, compared as day tokens (viewer zone). */
function completedOnTime(t: TaskRow, timeZone: string): boolean {
  return (
    t.completedAt !== null &&
    t.dueDate !== null &&
    dateKeyInZone(t.completedAt, timeZone) <= t.dueDate
  );
}

export function computeTaskStats(
  tasks: TaskRow[],
  window: TimeWindow,
  now: number,
  timeZone: string,
): TaskStats {
  const top = topLevel(tasks);
  const todayKey = dateKeyInZone(now, timeZone);

  let createdCount = 0;
  let createdCompleted = 0;
  let completedCount = 0;
  let dueCount = 0;
  let onTime = 0;
  let overdueOpenCount = 0;
  const leadTimes: number[] = [];

  for (const t of top) {
    if (inWindow(t.createdAt, window)) {
      createdCount += 1;
      if (t.completedAt !== null) createdCompleted += 1;
    }
    if (inWindow(t.completedAt, window)) {
      completedCount += 1;
      leadTimes.push((t.completedAt as number) - t.createdAt);
    }
    if (dueInWindow(t, window, timeZone)) {
      dueCount += 1;
      if (completedOnTime(t, timeZone)) onTime += 1;
    }
    if (t.completedAt === null && t.dueDate !== null && t.dueDate < todayKey) {
      overdueOpenCount += 1;
    }
  }

  leadTimes.sort((a, b) => a - b);
  const mid = Math.floor(leadTimes.length / 2);
  const medianLeadTimeMs =
    leadTimes.length === 0
      ? null
      : leadTimes.length % 2 === 1
        ? leadTimes[mid]
        : (leadTimes[mid - 1] + leadTimes[mid]) / 2;

  return {
    createdCount,
    completedCount,
    dueCount,
    adherenceRate: dueCount > 0 ? onTime / dueCount : null,
    overdueOpenCount,
    completionRate: createdCount > 0 ? createdCompleted / createdCount : null,
    medianLeadTimeMs,
  };
}

/** Created vs completed counts per bucket (top-level only). */
export function taskVelocity(tasks: TaskRow[], buckets: Bucket[]): VelocityPoint[] {
  const top = topLevel(tasks);
  return buckets.map((b) => {
    let created = 0;
    let completed = 0;
    for (const t of top) {
      if (inWindow(t.createdAt, b)) created += 1;
      if (inWindow(t.completedAt, b)) completed += 1;
    }
    return { start: b.start, end: b.end, created, completed };
  });
}

/**
 * Window stats per collection (null = no collection), for every collection that
 * has any top-level task; most completed first, then most created.
 */
export function statsByCollection(
  tasks: TaskRow[],
  window: TimeWindow,
  now: number,
  timeZone: string,
): CollectionStats[] {
  const top = topLevel(tasks);
  const todayKey = dateKeyInZone(now, timeZone);
  const byCollection = new Map<string | null, CollectionStats>();

  for (const t of top) {
    let row = byCollection.get(t.collectionId);
    if (!row) {
      row = {
        collectionId: t.collectionId,
        createdCount: 0,
        completedCount: 0,
        dueCount: 0,
        overdueOpenCount: 0,
      };
      byCollection.set(t.collectionId, row);
    }
    if (inWindow(t.createdAt, window)) row.createdCount += 1;
    if (inWindow(t.completedAt, window)) row.completedCount += 1;
    if (dueInWindow(t, window, timeZone)) row.dueCount += 1;
    if (t.completedAt === null && t.dueDate !== null && t.dueDate < todayKey) {
      row.overdueOpenCount += 1;
    }
  }

  return [...byCollection.values()].sort(
    (a, b) =>
      b.completedCount - a.completedCount ||
      b.createdCount - a.createdCount ||
      b.dueCount - a.dueCount,
  );
}
