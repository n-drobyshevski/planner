"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import { upsertTask, removeTasks } from "@/lib/tasks/cache";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { Board, TaskRow } from "@/lib/types";
import type { WorkspaceData } from "@/lib/hooks/use-workspace";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("toasts");
  const tc = useTranslations("common");

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
  // Boards live in the workspace bundle; read them from cache so callers don't
  // have to thread the list through every mutation site.
  const boardsOf = (collectionId: string | null): Board[] => {
    const data = qc.getQueryData<WorkspaceData>(qk.workspace);
    return (data?.boards ?? [])
      .filter((b) => b.collectionId === collectionId)
      .sort((a, b) => a.position - b.position);
  };
  const isDoneBoard = (boardId: string | null): boolean => {
    if (!boardId) return false;
    const data = qc.getQueryData<WorkspaceData>(qk.workspace);
    return (data?.boards ?? []).find((b) => b.id === boardId)?.isDone ?? false;
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
          toast.error(e instanceof Error ? e.message : t("couldntUndo"));
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
        spec ? { action: { label: tc("undo"), onClick: () => void runUndo() } } : undefined,
      );
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : tc("somethingWentWrong"));
      return false;
    }
  }

  return {
    create: (input: TaskInput) =>
      run(m.createTask(sb, input), t("taskCreated"), {
        undo: (row) => inverse(t("undoLabel.create"), () => m.deleteTask(sb, row.id)),
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      }),

    /**
     * Create a task AND immediately schedule it as one calendar block — used by
     * the calendar's "new task" flow when the user opts to place it on the grid.
     * The block links back via task_id, so it shows on the calendar and as a
     * scheduled marker in Flows. Undo deletes the task; the events cascade-delete
     * with it (FK on delete cascade), and `alsoEvents` refreshes both surfaces.
     */
    createWithBlock: (
      input: TaskInput,
      segment: { start: number; end: number; title?: string },
      timeZone: string,
    ) =>
      run(
        (async () => {
          const task = await m.createTask(sb, input);
          const events = await m.scheduleTaskBlocks(sb, task, [segment], timeZone);
          return { task, events };
        })(),
        t("taskCreated"),
        {
          alsoEvents: true,
          apply: ({ task }) => setTasks((old) => upsertTask(old, task)),
          undo: ({ task }) =>
            inverse(t("undoLabel.create"), () => m.deleteTask(sb, task.id), true),
        },
      ),
    update: (
      id: string,
      patch: Partial<TaskInput>,
      prev?: Partial<TaskInput>,
      /** Row fields to apply optimistically (e.g. { color } from a recolor). */
      optimisticRowPatch?: Partial<TaskRow>,
    ) =>
      run(m.updateTask(sb, id, patch), t("taskUpdated"), {
        undo: (row) =>
          prev
            ? inverse(t("undoLabel.edit"), () => m.updateTask(sb, id, prev, row.updatedAt))
            : null,
        optimistic: optimisticRowPatch
          ? () => patchTaskCache(id, (t) => ({ ...t, ...optimisticRowPatch }))
          : undefined,
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      }),
    /**
     * Hand a task (and its subtree) to another member. A full task refetch
     * reconciles the result: a still-shared task shows the new owner, while a
     * transferred private task drops out of this member's view entirely. Not
     * undoable — once it's the other member's task, RLS won't let this member
     * move it back.
     */
    transfer: (taskId: string, newOwnerId: string) =>
      run(m.transferTaskOwnership(sb, taskId, newOwnerId), t("taskTransferred")),

    remove: (id: string) =>
      run(m.deleteTaskDeep(sb, id), t("taskDeleted"), {
        alsoEvents: true,
        undo: (snap) => inverse(t("undoLabel.delete"), () => m.restoreDeleted(sb, snap), true),
        optimistic: () => removeTaskFromCache(id),
        // The snapshot lists every cascaded row, so deeper-than-one subtrees
        // (which the optimistic patch doesn't cover) are dropped too.
        apply: (snap) =>
          setTasks((old) => removeTasks(old, snap.tasks.map((r) => r.id as string))),
      }),

    /** Move to a board column at a new position; the server normalizes completed_at. */
    move: (task: TaskRow, boardId: string, position: number) => {
      const targetDone = isDoneBoard(boardId);
      const patch: Partial<TaskInput> = { boardId, position };
      // Optimistic completed_at; the BEFORE trigger sets it authoritatively from
      // the target board's is_done on the server.
      const nextCompletedAt = targetDone ? task.completedAt ?? Date.now() : null;
      if (boardId !== task.boardId) patch.completedAt = nextCompletedAt;
      const prev: Partial<TaskInput> = {
        boardId: task.boardId,
        position: task.position,
        completedAt: task.completedAt,
      };
      return run(m.updateTask(sb, task.id, patch), t("taskMoved"), {
        undo: (row) =>
          inverse(t("undoLabel.move"), () => m.updateTask(sb, task.id, prev, row.updatedAt)),
        optimistic: () =>
          patchTaskCache(task.id, (t) => ({ ...t, ...patch, completedAt: nextCompletedAt })),
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      });
    },

    /**
     * Persist a Flows-side-panel manual reorder. The lane order is a presentation
     * concern independent of the per-board `position`, so it lives in the task's
     * `attributes` bag (`flowPos`, a fractional rank) — no schema change, and the
     * loose attributes round-trip keeps it across edits and the other member's
     * realtime. A single row write per drop.
     */
    reorderFlow: (task: TaskRow, flowPos: number) => {
      const nextAttrs = { ...task.attributes, flowPos };
      const prevAttrs = task.attributes;
      return run(m.updateTask(sb, task.id, { attributes: nextAttrs }), t("taskMoved"), {
        undo: (row) =>
          inverse(t("undoLabel.move"), () =>
            m.updateTask(sb, task.id, { attributes: prevAttrs }, row.updatedAt),
          ),
        optimistic: () => patchTaskCache(task.id, (tk) => ({ ...tk, attributes: nextAttrs })),
        apply: (row) => setTasks((old) => upsertTask(old, row)),
      });
    },

    /**
     * Toggle the done state (e.g. a checkbox): move the task to its collection's
     * completion column, or back to the first non-done column. No-op when the
     * collection has no suitable board (e.g. a board-less task).
     */
    toggleDone: (task: TaskRow) => {
      const done = task.completedAt != null;
      const cols = boardsOf(task.collectionId);
      const target = done
        ? cols.find((b) => !b.isDone) ?? null
        : cols.find((b) => b.isDone) ?? null;
      if (!target) return Promise.resolve(false);
      const nextCompletedAt = done ? null : Date.now();
      const prev: Partial<TaskInput> = {
        boardId: task.boardId,
        completedAt: task.completedAt,
      };
      return run(
        m.updateTask(sb, task.id, { boardId: target.id, completedAt: nextCompletedAt }),
        done ? t("taskReopened") : t("taskCompleted"),
        {
          undo: (row) =>
            inverse(done ? t("undoLabel.reopen") : t("undoLabel.complete"), () =>
              m.updateTask(sb, task.id, prev, row.updatedAt),
            ),
          optimistic: () =>
            patchTaskCache(task.id, (t) => ({
              ...t,
              boardId: target.id,
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
      run(m.scheduleTaskBlocks(sb, task, segments, timeZone), t("addedToCalendar"), {
        alsoEvents: true,
        apply: () => {}, // only events change; the task set is untouched
        undo: (rows) =>
          rows.length === 0
            ? null
            : inverse(
                t("undoLabel.schedule"),
                () => Promise.all(rows.map((r) => m.deleteEvent(sb, r.id))),
                true,
              ),
      }),

    /** Schedule blocks that each link to their own task (e.g. subtasks). */
    scheduleMany: (
      items: { task: TaskRow; start: number; end: number; title?: string }[],
      timeZone: string,
    ) =>
      run(m.scheduleBlocks(sb, items, timeZone), t("addedToCalendar"), {
        alsoEvents: true,
        apply: () => {}, // only events change; the task set is untouched
        undo: (rows) =>
          rows.length === 0
            ? null
            : inverse(
                t("undoLabel.schedule"),
                () => Promise.all(rows.map((r) => m.deleteEvent(sb, r.id))),
                true,
              ),
      }),
  };
}
