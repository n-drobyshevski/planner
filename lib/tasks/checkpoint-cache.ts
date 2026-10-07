// Targeted updates for the ["task-checkpoints", workspaceId] cache. Mutation
// results are applied directly so the marker reflects a write without a full
// refetch; the data hook coarsely invalidates on realtime. Pure — no I/O.
import type { TaskCheckpoint } from "@/lib/types";

/**
 * Replace-or-append a checkpoint. A strictly older `updatedAt` is skipped: a
 * realtime echo can arrive after a newer optimistic/mutation result has already
 * landed, and the stale echo must not clobber it (mirrors upsertTask).
 */
export function upsertCheckpoint(
  list: TaskCheckpoint[],
  row: TaskCheckpoint,
): TaskCheckpoint[] {
  const i = list.findIndex((c) => c.id === row.id);
  if (i < 0) return [...list, row];
  if (list[i].updatedAt > row.updatedAt) return list;
  const next = list.slice();
  next[i] = row;
  return next;
}

/**
 * Drop every checkpoint of `taskId`: the task turned private, and its
 * checkpoints with it (they inherit its visibility), but nothing was deleted,
 * so no checkpoint change arrives on its own.
 */
export function removeCheckpointsOfTask(
  list: TaskCheckpoint[],
  taskId: string,
): TaskCheckpoint[] {
  const next = list.filter((c) => c.taskId !== taskId);
  return next.length === list.length ? list : next;
}

/**
 * Whether `change` shares again a task whose checkpoints were dropped when it
 * turned private (`hiddenTasks`, which then forgets it). That is a plain tasks
 * UPDATE: the checkpoints themselves didn't change, so none of them arrive on
 * their own, and the cache has to refetch them.
 */
export function reshowsHiddenTask(
  hiddenTasks: Set<string>,
  change: { table: string; eventType: string; new: unknown },
): boolean {
  if (change.table !== "tasks" || change.eventType !== "UPDATE") return false;
  const row = change.new as { id?: unknown; is_private?: unknown } | null;
  const id = typeof row?.id === "string" ? row.id : null;
  if (id === null || row?.is_private !== false || !hiddenTasks.has(id)) return false;
  hiddenTasks.delete(id);
  return true;
}

/** Drop a checkpoint by id. */
export function removeCheckpoint(
  list: TaskCheckpoint[],
  id: string,
): TaskCheckpoint[] {
  const next = list.filter((c) => c.id !== id);
  return next.length === list.length ? list : next;
}
