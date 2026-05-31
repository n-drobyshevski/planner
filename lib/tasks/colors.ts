import type { TaskRow, Category, Member } from "@/lib/types";

// Mirrors lib/calendar/colors.ts so tasks and their scheduled blocks read the
// same. Category color wins; else the assignee/owner member color; else the
// shared-amber fallback.
const SHARED_FALLBACK = "#b45309"; // amber
const PERSONAL_FALLBACK = "#c0492a"; // coral

export function resolveTaskColor(
  task: Pick<
    TaskRow,
    "categoryId" | "scope" | "ownerId" | "assigneeId"
  >,
  categories: Map<string, Category>,
  members: Map<string, Member>,
): string {
  if (task.categoryId) {
    const c = categories.get(task.categoryId);
    if (c) return c.color;
  }
  if (task.scope === "shared") return SHARED_FALLBACK;
  const memberId = task.assigneeId ?? task.ownerId;
  return members.get(memberId)?.color ?? PERSONAL_FALLBACK;
}
