// Pure geometry for the "runway" lane style in Flows: each task is a bar from
// its start to its deadline (the runway it has), filled from the left by the
// share of its subtasks that are done. No DOM, no clock: `nowMs` (and, for the
// day-resolution "late" test, the viewer's `today` token) are passed in, like
// lib/tasks/flows-layout.ts.

import type { FlowSegment } from "@/lib/tasks/flows-layout";
import { DAY_MS } from "@/lib/tasks/flows-layout";
import { dateInputToUtcMs } from "@/lib/datetime/local";
import { daysUntil } from "@/lib/tasks/attention";

/**
 * planned    — starts in the future (outlined dotted: "pencilled in")
 * open       — under way, deadline still ahead (or today)
 * late       — open and past its deadline: a hatched overrun to the now-line
 * done       — finished: a full, muted bar from start to completion
 * open-ended — under way with no deadline: no right edge, fades past now
 */
export type RunwayState = "planned" | "open" | "late" | "done" | "open-ended";

export interface Runway {
  state: RunwayState;
  /** left edge (the task's start) */
  startMs: number;
  /**
   * right edge: the end of the deadline day, the completion, or (open-ended)
   * where the fade-out finishes. Never before `startMs`.
   */
  endMs: number;
  /** the bar has no real right edge (no deadline): draw it fading out */
  openEnded: boolean;
  /** end of the deadline day (UTC-midnight token + 1 day), or null when undated */
  deadlineMs: number | null;
  /** share of the subtree's subtasks that are done, 0..1 (done = 1; no subtasks = 0) */
  progress: number;
  /** subtasks done / total, for the accessible name ("2 of 5 subtasks done") */
  subtasks: { done: number; total: number };
  /** deadline -> now, when open and late; null otherwise */
  overrun: { fromMs: number; toMs: number } | null;
}

export interface RunwayOpts {
  /**
   * How far an open-ended bar reaches past `max(now, start)` before it has
   * faded out. The renderer passes a pixel-derived span so the fade reads the
   * same at every zoom; the default is three days.
   */
  fadeMs?: number;
  /**
   * The viewer's calendar day ("yyyy-MM-dd"). When given, "late" is decided by
   * whole days against it (matching the gutter's "overdue" wording, so a task
   * due today is never late); without it, by `nowMs` against the end of the
   * deadline day.
   */
  today?: string;
}

export const RUNWAY_FADE_DAYS = 3;

/**
 * The runway for a trunk or branch segment, or null for a milestone (a point in
 * time has no runway; it keeps its moment marker).
 */
export function runwayOf(
  seg: FlowSegment,
  nowMs: number,
  subtasks: { done: number; total: number },
  opts: RunwayOpts = {},
): Runway | null {
  if (seg.milestone) return null;
  const fadeMs = opts.fadeMs ?? RUNWAY_FADE_DAYS * DAY_MS;
  const { task } = seg;
  const startMs = seg.startMs;
  const deadlineMs = task.dueDate ? dateInputToUtcMs(task.dueDate) + DAY_MS : null;
  const total = Math.max(0, subtasks.total);
  const doneCount = Math.min(Math.max(0, subtasks.done), total);
  const sub = { done: doneCount, total };

  if (seg.endMs !== null || task.completedAt != null) {
    const endMs = Math.max(startMs, seg.endMs ?? task.completedAt ?? startMs);
    return {
      state: "done",
      startMs,
      endMs,
      openEnded: false,
      deadlineMs,
      progress: 1,
      subtasks: sub,
      overrun: null,
    };
  }

  const progress = total > 0 ? doneCount / total : 0;
  const planned = startMs > nowMs;

  if (deadlineMs === null) {
    return {
      state: planned ? "planned" : "open-ended",
      startMs,
      endMs: Math.max(startMs, nowMs) + fadeMs,
      openEnded: true,
      deadlineMs: null,
      progress,
      subtasks: sub,
      overrun: null,
    };
  }

  const endMs = Math.max(startMs, deadlineMs);
  const late = opts.today
    ? daysUntil(task.dueDate as string, opts.today) < 0
    : nowMs >= deadlineMs;
  if (planned || !late) {
    return {
      state: planned ? "planned" : "open",
      startMs,
      endMs,
      openEnded: false,
      deadlineMs,
      progress,
      subtasks: sub,
      overrun: null,
    };
  }
  // Late: the bar keeps its deadline edge; the overrun runs on to the now-line.
  const fromMs = Math.min(endMs, nowMs);
  return {
    state: "late",
    startMs,
    endMs,
    openEnded: false,
    deadlineMs,
    progress,
    subtasks: sub,
    overrun: { fromMs, toMs: Math.max(fromMs, nowMs) },
  };
}

/** The furthest x-extent a runway paints (its edge or its overrun), for window checks. */
export function runwayReachMs(r: Runway): number {
  return Math.max(r.endMs, r.overrun?.toMs ?? r.endMs);
}

/** How the short label right of the bar names the deadline. */
export type RunwayDueLabel =
  | { kind: "today" }
  | { kind: "tomorrow" }
  /** 2..6 days ahead: the weekday alone ("Sat") */
  | { kind: "weekday"; dueDate: string }
  /** further out, or already passed on a planned bar: the date ("19 Nov") */
  | { kind: "date"; dueDate: string }
  | { kind: "over"; days: number };

/**
 * The short deadline label for a runway, or null where none is shown (done,
 * open-ended, undated). Day arithmetic is against the viewer's `today` token.
 */
export function runwayDueLabel(
  r: Runway,
  dueDate: string | null,
  today: string,
): RunwayDueLabel | null {
  if (!dueDate || r.state === "done" || r.openEnded) return null;
  const days = daysUntil(dueDate, today);
  if (r.state === "late") return { kind: "over", days: Math.max(1, -days) };
  if (days === 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  if (days >= 2 && days <= 6) return { kind: "weekday", dueDate };
  return { kind: "date", dueDate };
}

/**
 * Slim stacked bars for a collapsed stream row: how many fit, how tall each is
 * and where each sits. `count` bars are wanted; the rest become "+N".
 */
export function stackSlots(
  count: number,
  rowHeight: number,
  opts: { barHeight?: number; gap?: number; pad?: number } = {},
): { shown: number; hidden: number; barHeight: number; tops: number[] } {
  const barHeight = opts.barHeight ?? 6;
  const gap = opts.gap ?? 3;
  const pad = opts.pad ?? 6;
  const room = Math.max(0, rowHeight - 2 * pad);
  const fit = Math.max(0, Math.floor((room + gap) / (barHeight + gap)));
  const shown = Math.min(count, fit);
  const used = shown * barHeight + Math.max(0, shown - 1) * gap;
  const first = (rowHeight - used) / 2; // centred in the row
  const tops = Array.from({ length: shown }, (_, i) => first + i * (barHeight + gap));
  return { shown, hidden: count - shown, barHeight, tops };
}
