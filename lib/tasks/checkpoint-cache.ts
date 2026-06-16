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

/** Drop a checkpoint by id. */
export function removeCheckpoint(
  list: TaskCheckpoint[],
  id: string,
): TaskCheckpoint[] {
  const next = list.filter((c) => c.id !== id);
  return next.length === list.length ? list : next;
}
