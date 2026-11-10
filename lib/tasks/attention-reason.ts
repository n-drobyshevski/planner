// Why a lane needs attention, as data the UI turns into words ("due tomorrow",
// "overdue 2 days", "high priority"). Pure: "today" is passed in, like
// lib/tasks/attention.ts, whose scores this explains.

import type { FlowLane } from "@/lib/tasks/flows-layout";
import {
  ATTENTION_HORIZON_DAYS,
  laneAttention,
  needsAttention,
  type AttentionLevel,
  type AttentionMode,
} from "@/lib/tasks/attention";

export interface AttentionReason {
  level: AttentionLevel;
  /** days to the soonest open deadline (negative = overdue), when it counts in this mode */
  days: number | null;
  /** the highest open priority (2 = medium, 3 = high), when it counts in this mode */
  priority: 2 | 3 | null;
}

/**
 * The reasons behind a lane's attention, or null when it does not need
 * attention now (below the medium bar). A deadline counts outside "priority"
 * mode when it is inside the attention horizon (or passed); a priority counts
 * outside "deadline" mode when it is medium or high. Open tasks only: the trunk
 * and its open branches, as laneAttention scores them.
 */
export function attentionReason(
  lane: FlowLane,
  today: string,
  mode: AttentionMode,
): AttentionReason | null {
  const info = laneAttention(lane, today, mode);
  if (!needsAttention(info.score)) return null;

  const days =
    mode !== "priority" && info.daysToDue !== null && info.daysToDue < ATTENTION_HORIZON_DAYS
      ? info.daysToDue
      : null;

  let top = 0;
  if (mode !== "deadline") {
    for (const t of [lane.task, ...lane.branches.map((b) => b.task)]) {
      if (t.completedAt == null) top = Math.max(top, t.priority ?? 0);
    }
  }
  const priority = top >= 3 ? 3 : top === 2 ? 2 : null;

  return { level: info.level, days, priority };
}
