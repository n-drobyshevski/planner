// Targeted updates for the ["tasks", workspaceId] cache. Realtime payloads and
// mutation results are applied directly instead of invalidate-refetching the
// whole set on every change; consumers re-sort via groupByParent, so list
// order here doesn't matter. Pure — no I/O.
import { mapTask } from "@/lib/supabase/mappers";
import type { WorkspaceChange } from "@/lib/supabase/realtime";
import type { TaskRow } from "@/lib/types";

/**
 * Replace-or-append a row. A strictly older `updatedAt` is skipped: realtime
 * can echo a write after a newer optimistic/mutation result has already been
 * applied, and the stale echo must not clobber it.
 */
export function upsertTask(list: TaskRow[], row: TaskRow): TaskRow[] {
  const i = list.findIndex((t) => t.id === row.id);
  if (i < 0) return [...list, row];
  if (list[i].updatedAt > row.updatedAt) return list;
  const next = list.slice();
  next[i] = row;
  return next;
}

/** Drop a task and its (transitive) subtasks — the DB cascades the same way. */
export function removeTask(list: TaskRow[], id: string): TaskRow[] {
  return removeTasks(list, [id]);
}

/** Drop several tasks and all their (transitive) subtasks. */
export function removeTasks(list: TaskRow[], ids: Iterable<string>): TaskRow[] {
  const doomed = new Set(ids);
  if (doomed.size === 0) return list;
  // Subtrees are shallow (subtasks of subtasks at most); sweep until stable.
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of list) {
      if (t.parentId !== null && doomed.has(t.parentId) && !doomed.has(t.id)) {
        doomed.add(t.id);
        grew = true;
      }
    }
  }
  const next = list.filter((t) => !doomed.has(t.id));
  return next.length === list.length ? list : next;
}

/**
 * Apply one realtime row change. INSERT/UPDATE carry the full row in `new`;
 * DELETE carries only the primary key in `old` (default replica identity),
 * which is all `removeTask` needs.
 */
export function applyTaskChange(list: TaskRow[], change: WorkspaceChange): TaskRow[] {
  if (change.eventType === "DELETE") {
    const id = (change.old as { id?: string }).id;
    return id ? removeTask(list, id) : list;
  }
  const row = change.new as Record<string, unknown>;
  if (typeof row?.id !== "string") return list;
  return upsertTask(list, mapTask(row));
}
