// Pure helpers for the task tree (top-level tasks + their subtasks). No I/O.
import type { TaskRow } from "@/lib/types";

/** Stable order: by position, then creation time as a tiebreak. */
export function sortByPosition(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort(
    (a, b) => a.position - b.position || a.createdAt - b.createdAt,
  );
}

/**
 * Group tasks by parentId. The `null` key holds top-level tasks; every list is
 * sorted by position. One pass, so callers can look up children cheaply.
 */
export function groupByParent(tasks: TaskRow[]): Map<string | null, TaskRow[]> {
  const map = new Map<string | null, TaskRow[]>();
  for (const t of tasks) {
    const arr = map.get(t.parentId);
    if (arr) arr.push(t);
    else map.set(t.parentId, [t]);
  }
  for (const [key, arr] of map) map.set(key, sortByPosition(arr));
  return map;
}

/** Children of a parent, sorted by position. */
export function childrenOf(tasks: TaskRow[], parentId: string): TaskRow[] {
  return sortByPosition(tasks.filter((t) => t.parentId === parentId));
}

/** Completion progress of a list of subtasks. */
export function progressOf(children: TaskRow[]): { done: number; total: number } {
  let done = 0;
  for (const c of children) if (c.status === "done") done++;
  return { done, total: children.length };
}
