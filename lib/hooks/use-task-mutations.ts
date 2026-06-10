"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import { upsertTask, removeTasks } from "@/lib/tasks/cache";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { TaskRow } from "@/lib/types";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Task write operations wrapped with targeted cache reconciliation + toasts.
 * Successful writes apply the returned server row to the cache (so trigger-
 * normalized fields land too) instead of refetching the whole set; realtime
 * applies the same rows for the other member. Scheduling touches the events
 * table, so those calls still invalidate the event windows. Successful writes
 * push an inverse onto the history store so Ctrl+Z can undo.
 */
export function useTaskMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const runUndo = useHistoryStore((s) => s.runUndo);
  const notify = useNotify();

  const invalidate = (alsoEvents = false) => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) });
    if (alsoEvents) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };
  const invalidateEvents = () => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };
  const setTasks = (updater: (old: TaskRow[]) => TaskRow[]) => {
    if (!workspaceId) return;
    qc.setQueryData<TaskRow[]>(qk.tasks(workspaceId), (old) =>
      old ? updater(old) : old,
    );
  };

  // --- Optimistic cache patches -------------------------------------------
  // The tasks query is a single flat list (not windowed), so patches are simple
  // map/filter over ["tasks", workspaceId]. Each returns a rollback that restores
  // the snapshot; `run` calls it if the write throws. invalidate() + realtime
  // reconcile on success.
  const patchTaskCache = (taskId: string, patch: (t: TaskRow) => TaskRow) => {
    if (!workspaceId) return () => {};
    const key = qk.tasks(workspaceId);
    const prev = qc.getQueryData<TaskRow[]>(key);
    qc.setQueryData<TaskRow[]>(key, (old) =>
      old?.map((t) => (t.id === taskId ? patch(t) : t)),
    );
    return () => qc.setQueryData(key, prev);
  };
  const removeTaskFromCache = (taskId: string) => {
    if (!workspaceId) return () => {};
    const key = qk.tasks(workspaceId);
    const prev = qc.getQueryData<TaskRow[]>(key);
    // Drop the task and its direct subtasks (deleteTaskDeep cascades server-side).
    qc.setQueryData<TaskRow[]>(key, (old) =>
      old?.filter((t) => t.id !== taskId && t.parentId !== taskId),
    );
    return () => qc.setQueryData(key, prev);
  };

  /** Wrap a raw inverse op: invalidate on success, toast + false on failure. */
  const inverse = (
    label: string,
    op: () => Promise<unknown>,
    alsoEvents = false,
  ): UndoSpec => ({
    label,
    undo: () =>
      op()
        .then(() => {
          invalidate(alsoEvents);
          return true;
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Couldn't undo");
          return false;
        }),
  });

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    opts?: {
      alsoEvents?: boolean;
      undo?: (result: T) => UndoSpec | null;
      /** Apply an optimistic cache patch now; returns the rollback for the catch. */
      optimistic?: () => () => void;
      /**
       * Reconcile the cache from the server result instead of refetching the
       * task set (events still refetch when `alsoEvents`). Without it, success
       * falls back to a full invalidate.
       */
      apply?: (result: T) => void;
    },
  ): Promise<boolean> {
    const rollback = opts?.optimistic?.();
    try {
      const result = await p;
      if (opts?.apply) {
        opts.apply(result);
        if (opts.alsoEvents) invalidateEvents();
      } else {
        invalidate(opts?.alsoEvents);
      }
      const spec = opts?.undo?.(result) ?? null;
      if (spec) pushUndo(spec);
      // Undoable actions get a visible Undo on the toast (works on mobile, where
      // there's no Ctrl+Z); it pops the same history entry Ctrl+Z would.
      notify.success(
        okMsg,
        spec ? { action: { label: "Undo", onClick: () => void runUndo() } } : undefined,
      );
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    create: (input: TaskInput) =>
      run(m.createTask(sb, input), "Task created", {
        undo: (row) => inverse("create", () => m.deleteTask(sb, row.id)),
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      }),
    update: (
      id: string,
      patch: Partial<TaskInput>,
      prev?: Partial<TaskInput>,
      /** Row fields to apply optimistically (e.g. { color } from a recolor). */
      optimisticRowPatch?: Partial<TaskRow>,
    ) =>
      run(m.updateTask(sb, id, patch), "Task updated", {
        undo: (row) =>
          prev
            ? inverse("edit", () => m.updateTask(sb, id, prev, row.updatedAt))
            : null,
        optimistic: optimisticRowPatch
          ? () => patchTaskCache(id, (t) => ({ ...t, ...optimisticRowPatch }))
          : undefined,
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      }),
    remove: (id: string) =>
      run(m.deleteTaskDeep(sb, id), "Task deleted", {
        alsoEvents: true,
        undo: (snap) => inverse("delete", () => m.restoreDeleted(sb, snap), true),
        optimistic: () => removeTaskFromCache(id),
        // The snapshot lists every cascaded row, so deeper-than-one subtrees
        // (which the optimistic patch doesn't cover) are dropped too.
        apply: (snap) =>
          setTasks((old) => removeTasks(old, snap.tasks.map((r) => r.id as string))),
      }),

    /** Move to a status column at a new position; manages completed_at on transition. */
    move: (task: TaskRow, status: TaskRow["status"], position: number) => {
      const patch: Partial<TaskInput> = { status, position };
      if (status !== task.status) {
        if (status === "done") patch.completedAt = Date.now();
        else if (task.status === "done") patch.completedAt = null;
      }
      const prev: Partial<TaskInput> = {
        status: task.status,
        position: task.position,
        completedAt: task.completedAt,
      };
      return run(m.updateTask(sb, task.id, patch), "Task moved", {
        undo: (row) =>
          inverse("move", () => m.updateTask(sb, task.id, prev, row.updatedAt)),
        optimistic: () => patchTaskCache(task.id, (t) => ({ ...t, ...patch })),
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      });
    },

    /** Toggle the done state (e.g. a checkbox). */
    toggleDone: (task: TaskRow) => {
      const done = task.status === "done";
      const nextStatus: TaskRow["status"] = done ? "todo" : "done";
      const nextCompletedAt = done ? null : Date.now();
      const prev: Partial<TaskInput> = {
        status: task.status,
        completedAt: task.completedAt,
      };
      return run(
        m.updateTask(sb, task.id, { status: nextStatus, completedAt: nextCompletedAt }),
        done ? "Task reopened" : "Task completed",
        {
          undo: (row) =>
            inverse(done ? "reopen" : "complete", () =>
              m.updateTask(sb, task.id, prev, row.updatedAt),
            ),
          optimistic: () =>
            patchTaskCache(task.id, (t) => ({
              ...t,
              status: nextStatus,
              completedAt: nextCompletedAt,
            })),
          apply: (row) => setTasks((old) => upsertTask(old, row)),
        },
      );
    },

    /** Schedule task blocks onto the calendar (creates linked events). */
    schedule: (
      task: TaskRow,
      segments: { start: number; end: number; title?: string }[],
      timeZone: string,
    ) =>
      run(m.scheduleTaskBlocks(sb, task, segments, timeZone), "Added to calendar", {
        alsoEvents: true,
        apply: () => {}, // only events change; the task set is untouched
        undo: (rows) =>
          rows.length === 0
            ? null
            : inverse(
                "schedule",
                () => Promise.all(rows.map((r) => m.deleteEvent(sb, r.id))),
                true,
              ),
      }),

    /** Schedule blocks that each link to their own task (e.g. subtasks). */
    scheduleMany: (
      items: { task: TaskRow; start: number; end: number; title?: string }[],
      timeZone: string,
    ) =>
      run(m.scheduleBlocks(sb, items, timeZone), "Added to calendar", {
        alsoEvents: true,
        apply: () => {}, // only events change; the task set is untouched
        undo: (rows) =>
          rows.length === 0
            ? null
            : inverse(
                "schedule",
                () => Promise.all(rows.map((r) => m.deleteEvent(sb, r.id))),
                true,
              ),
      }),
  };
}
