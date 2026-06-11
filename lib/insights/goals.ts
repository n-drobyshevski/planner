// Goal-progress math for the Insights views (pure, no I/O).
//
// A CategoryGoal stores a WEEKLY target; here it is scaled to the viewed
// window by day count (`weeklyTargetMs * days.length / 7` — DST weeks still
// count 7 days even though they span 167/169 hours) and judged against the
// category's tracked time, pace-aware: mid-window, "doing fine" means being
// at or ahead of the elapsed fraction of the target, not the whole thing.

import type { CategoryGoal, TimeWindow } from "@/lib/types";

export type GoalJudgment = "on-track" | "behind" | "over" | "met";

export interface GoalProgress {
  goal: CategoryGoal;
  /** weekly_target_ms scaled to the window: weeklyTargetMs * (days.length / 7) */
  targetMs: number;
  /** the category's tracked ms for the window (caller-supplied) */
  actualMs: number;
  /** actualMs / targetMs */
  ratio: number;
  judgment: GoalJudgment;
  /** expected pace fraction: elapsed days (incl. partial today) / total days,
   *  clamped 0..1; null for fully-past windows where pace isn't meaningful */
  expected: number | null;
}

/**
 * Fraction of the window already elapsed at `now`, counted in days (whole
 * elapsed days plus the fraction of the current one), clamped 0..1. Null when
 * the window is fully past — a finished window has no "pace", only a result.
 */
function expectedPace(
  days: number[],
  window: TimeWindow,
  now: number,
): number | null {
  if (days.length === 0) return null;
  if (now >= window.end) return null; // fully past
  if (now <= window.start) return 0;
  let elapsed = 0;
  for (let i = 0; i < days.length; i++) {
    const dayStart = days[i];
    const dayEnd = i + 1 < days.length ? days[i + 1] : window.end;
    if (now >= dayEnd) {
      elapsed += 1;
    } else if (now > dayStart) {
      elapsed += (now - dayStart) / (dayEnd - dayStart);
      break;
    } else {
      break;
    }
  }
  return Math.min(1, Math.max(0, elapsed / days.length));
}

/**
 * Judge a goal against the tracked time of a window.
 *
 * "at-least" (a target to reach):
 * - "met"      — actual >= target (done, regardless of pace);
 * - "on-track" — mid-window and actual >= expected-pace × target;
 * - "behind"   — under pace, or a fully-past window that never reached the
 *                target (no pace to be on — the window is lost).
 *
 * "at-most" (a budget cap):
 * - "over"     — actual > target (budget blown);
 * - "behind"   — mid-window, under the cap but above pace (running hot:
 *                spending faster than the budget allows);
 * - "on-track" — at or under pace, or a fully-past window that stayed under
 *                the cap.
 *
 * `days` is the window's local-day start list (ResolvedPeriod.days); the
 * target scales by `days.length / 7`, so a DST week still counts as exactly
 * one week. "met" is never produced for "at-most", "over" never for
 * "at-least" — the four-value union covers both directions.
 */
export function goalProgress(
  goal: CategoryGoal,
  actualMs: number,
  days: number[],
  window: TimeWindow,
  now: number,
): GoalProgress {
  const targetMs = goal.weeklyTargetMs * (days.length / 7);
  const ratio = targetMs > 0 ? actualMs / targetMs : 0;
  const expected = expectedPace(days, window, now);

  let judgment: GoalJudgment;
  if (goal.direction === "at-least") {
    if (actualMs >= targetMs) judgment = "met";
    else if (expected !== null && actualMs >= expected * targetMs)
      judgment = "on-track";
    else judgment = "behind";
  } else {
    if (actualMs > targetMs) judgment = "over";
    else if (expected !== null && actualMs > expected * targetMs)
      judgment = "behind";
    else judgment = "on-track";
  }

  return { goal, targetMs, actualMs, ratio, judgment, expected };
}
