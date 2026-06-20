import type { TaskRow, Category, Member } from "@/lib/types";

// Mirrors lib/calendar/colors.ts so tasks and their scheduled blocks read the
// same. Own color wins; else category color; else the assignee/owner member
// color; else a generic fallback.
const FALLBACK = "#57534e"; // warm stone-600 (neutral, not a member identity)

export function resolveTaskColor(
  task: Pick<TaskRow, "color" | "categoryId" | "ownerId" | "assigneeId">,
  categories: Map<string, Category>,
  members: Map<string, Member>,
): string {
  if (task.color) return task.color; // per-item override wins
  if (task.categoryId) {
    const c = categories.get(task.categoryId);
    if (c) return c.color;
  }
  const memberId = task.assigneeId ?? task.ownerId;
  return members.get(memberId)?.color ?? FALLBACK;
}
