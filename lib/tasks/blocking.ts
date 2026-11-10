// Sequential subtask blocking. When a parent is "do in order", a subtask is
// blocked until every earlier sibling is done. Pure — order is the caller's
// responsibility (pass siblings already sorted by position).
import type { TaskRow } from "@/lib/types";

/**
 * Ids of subtasks that are blocked: only when `sequential`, the first not-done
 * subtask is actionable and every not-done subtask after it is blocked. Done
 * subtasks are never blocked.
 */
export function blockedIds(
  orderedSiblings: TaskRow[],
  sequential: boolean,
): Set<string> {
  const set = new Set<string>();
  if (!sequential) return set;
  let sawIncomplete = false;
  for (const t of orderedSiblings) {
    if (t.completedAt == null) {
      if (sawIncomplete) set.add(t.id);
      else sawIncomplete = true; // the first incomplete is actionable
    }
  }
  return set;
}

/** Whether a single subtask is blocked within its ordered siblings. */
export function isBlocked(
  task: TaskRow,
  orderedSiblings: TaskRow[],
  sequential: boolean,
): boolean {
  if (!sequential || task.completedAt != null) return false;
  const i = orderedSiblings.findIndex((t) => t.id === task.id);
  if (i < 0) return false;
  return orderedSiblings.slice(0, i).some((t) => t.completedAt == null);
}

/** The next subtask to work on (first not-done in order), or null. */
export function nextActionable(orderedSiblings: TaskRow[]): TaskRow | null {
  return orderedSiblings.find((t) => t.completedAt == null) ?? null;
}

// --- Dependency blocking (blocks / blocked-by, a separate DAG) --------------

/**
 * Ids of tasks blocked by an unmet dependency: a task is blocked while any task
 * it depends on is not complete. `isComplete` answers per blocker id (so the
 * caller decides what "complete" means — typically `completedAt != null`).
 */
export function dependencyBlockedIds(
  deps: { taskId: string; dependsOnTaskId: string }[],
  isComplete: (taskId: string) => boolean,
): Set<string> {
  const set = new Set<string>();
  for (const d of deps) if (!isComplete(d.dependsOnTaskId)) set.add(d.taskId);
  return set;
}

/** Whether a task is blocked, by either sequential order or an unmet dependency. */
export function isTaskBlocked(
  taskId: string,
  sequentialBlocked: ReadonlySet<string>,
  dependencyBlocked: ReadonlySet<string>,
): boolean {
  return sequentialBlocked.has(taskId) || dependencyBlocked.has(taskId);
}

/**
 * The unfinished tasks `taskId` waits on, most pressing first: the earliest
 * due date first (undated last), then the higher priority, then the title.
 * Blockers the caller can't see (absent from `byId`) are skipped.
 */
export function openBlockersOf(
  taskId: string,
  deps: readonly { taskId: string; dependsOnTaskId: string }[],
  byId: ReadonlyMap<string, TaskRow>,
): TaskRow[] {
  const out: TaskRow[] = [];
  const seen = new Set<string>();
  for (const d of deps) {
    if (d.taskId !== taskId || seen.has(d.dependsOnTaskId)) continue;
    seen.add(d.dependsOnTaskId);
    const blocker = byId.get(d.dependsOnTaskId);
    if (blocker && blocker.completedAt == null) out.push(blocker);
  }
  return out.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate == null) return 1;
      if (b.dueDate == null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return a.title.localeCompare(b.title);
  });
}
