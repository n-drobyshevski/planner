import type { Occurrence, Category, Member, TaskRow } from "@/lib/types";
import { resolveTaskColor } from "@/lib/tasks/colors";

// Fallback when an event has no category and its owner can't be resolved.
const FALLBACK = "#c0492a"; // coral (WCAG-AA on white text)

/**
 * Resolve the display color for an occurrence: per-item override, else category,
 * else its owner's calendar color. The owner color makes each member's calendar
 * read as its own color when overlaid (Google-Calendar style).
 */
export function resolveOccurrenceColor(
  occ: Occurrence,
  categories: Map<string, Category>,
  members: Map<string, Member>,
): string {
  if (occ.color) return occ.color; // per-item override wins
  if (occ.categoryId) {
    const c = categories.get(occ.categoryId);
    if (c) return c.color;
  }
  return members.get(occ.ownerId)?.color ?? FALLBACK;
}

/**
 * Display color for a calendar block. A block scheduled from a task follows that
 * task's color (override -> category -> member) via the live task, so recoloring
 * a task in any view (list / board / Flows) updates its blocks too — the task is
 * the single source of truth. Plain events keep occurrence resolution.
 */
export function resolveBlockColor(
  occ: Occurrence,
  tasksById: Map<string, TaskRow>,
  categories: Map<string, Category>,
  members: Map<string, Member>,
): string {
  if (occ.taskId) {
    const task = tasksById.get(occ.taskId);
    if (task) return resolveTaskColor(task, categories, members);
  }
  return resolveOccurrenceColor(occ, categories, members);
}
