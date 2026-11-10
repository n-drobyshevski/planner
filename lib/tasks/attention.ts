// "What needs attention now": a 0..1 score per task from its deadline, its
// priority, or both. Pure — "today" is passed in as a zone-free "yyyy-MM-dd"
// token (the viewer's calendar day), never read from a clock.

import type { FlowLane } from "@/lib/tasks/flows-layout";
import type { TaskRow } from "@/lib/types";
import { dateInputToUtcMs } from "@/lib/datetime/local";

export type AttentionMode = "deadline" | "priority" | "combined";
export const ATTENTION_MODES: AttentionMode[] = ["deadline", "priority", "combined"];

/** Days out at which a deadline stops counting as urgent at all (score 0). */
export const ATTENTION_HORIZON_DAYS = 14;

/** Highest priority value (TaskRow.priority is 0..3). */
const MAX_PRIORITY = 3;

export const ATTENTION_HIGH = 0.75;
export const ATTENTION_MEDIUM = 0.5;

const DAY_MS = 86_400_000;

/** Whole days from `today` to `dueDate`; negative once the due date has passed. */
export function daysUntil(dueDate: string, today: string): number {
  // Both tokens map to UTC midnight, so the difference is an exact day multiple.
  return Math.round((dateInputToUtcMs(dueDate) - dateInputToUtcMs(today)) / DAY_MS);
}

/** 0 with no deadline, 1 when due today or overdue, linear down to 0 at the horizon. */
export function urgencyOf(dueDate: string | null, today: string): number {
  if (!dueDate) return 0;
  const days = daysUntil(dueDate, today);
  if (days <= 0) return 1;
  return Math.max(0, 1 - days / ATTENTION_HORIZON_DAYS);
}

/** Priority 0..3 (null = none) as 0..1. */
export function importanceOf(priority: number | null): number {
  return Math.min(1, Math.max(0, (priority ?? 0) / MAX_PRIORITY));
}

type AttentionTask = Pick<TaskRow, "dueDate" | "priority" | "completedAt">;

export function attentionScore(
  task: AttentionTask,
  today: string,
  mode: AttentionMode,
): number {
  if (task.completedAt != null) return 0; // finished work never asks for attention
  const urgency = urgencyOf(task.dueDate, today);
  const importance = importanceOf(task.priority);
  if (mode === "deadline") return urgency;
  if (mode === "priority") return importance;
  return (urgency + importance) / 2;
}

export type AttentionLevel = "none" | "low" | "medium" | "high";

export function attentionLevel(score: number): AttentionLevel {
  if (score >= ATTENTION_HIGH) return "high";
  if (score >= ATTENTION_MEDIUM) return "medium";
  if (score > 0) return "low";
  return "none";
}

/** The bar for "needs attention now" (medium or high). */
export function needsAttention(score: number): boolean {
  return score >= ATTENTION_MEDIUM;
}

export interface AttentionInfo {
  score: number;
  level: AttentionLevel;
  /** open and past its due date (due today is not overdue) */
  overdue: boolean;
  /** days to the due date (negative = overdue); null when done or undated */
  daysToDue: number | null;
}

export const NO_ATTENTION: AttentionInfo = {
  score: 0,
  level: "none",
  overdue: false,
  daysToDue: null,
};

export function attentionInfo(
  task: AttentionTask,
  today: string,
  mode: AttentionMode,
): AttentionInfo {
  const score = attentionScore(task, today, mode);
  const open = task.completedAt == null;
  const daysToDue = open && task.dueDate ? daysUntil(task.dueDate, today) : null;
  return {
    score,
    level: attentionLevel(score),
    overdue: daysToDue !== null && daysToDue < 0,
    daysToDue,
  };
}

/**
 * A lane's attention: the strongest of its trunk and its open branches (an
 * urgent open subtask raises its parent). Deadline facts come from whichever
 * open task is due soonest, which may not be the strongest-scoring one.
 */
export function laneAttention(
  lane: FlowLane,
  today: string,
  mode: AttentionMode,
): AttentionInfo {
  const open = [lane.task, ...lane.branches.map((b) => b.task)].filter(
    (t) => t.completedAt == null,
  );
  if (open.length === 0) return NO_ATTENTION;

  let score = 0;
  let soonest: number | null = null;
  for (const t of open) {
    score = Math.max(score, attentionScore(t, today, mode));
    if (t.dueDate) {
      const d = daysUntil(t.dueDate, today);
      if (soonest === null || d < soonest) soonest = d;
    }
  }
  return {
    score,
    level: attentionLevel(score),
    overdue: soonest !== null && soonest < 0,
    daysToDue: soonest,
  };
}
