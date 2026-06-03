"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { TaskRow } from "@/lib/types";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Task write operations wrapped with cache invalidation + toasts. Realtime
 * also invalidates, so the other member sees changes live. Scheduling touches
 * the events table too, so those calls invalidate both task and event queries.
 * Successful writes push an inverse onto the history store so Ctrl+Z can undo.
 */
export function useTaskMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const notify = useNotify();

  const invalidate = (alsoEvents = false) => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) });
    if (alsoEvents) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
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
    opts?: { alsoEvents?: boolean; undo?: (result: T) => UndoSpec | null },
  ): Promise<boolean> {
    try {
      const result = await p;
      invalidate(opts?.alsoEvents);
      const spec = opts?.undo?.(result) ?? null;
      if (spec) pushUndo(spec);
      notify.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    create: (input: TaskInput) =>
      run(m.createTask(sb, input), "Task created", {
        undo: (row) => inverse("create", () => m.deleteTask(sb, row.id)),
      }),
    update: (id: string, patch: Partial<TaskInput>, prev?: Partial<TaskInput>) =>
      run(m.updateTask(sb, id, patch), "Task updated", {
        undo: (row) =>
          prev
            ? inverse("edit", () => m.updateTask(sb, id, prev, row.updatedAt))
            : null,
      }),
    remove: (id: string) =>
      run(m.deleteTaskDeep(sb, id), "Task deleted", {
        alsoEvents: true,
        undo: (snap) => inverse("delete", () => m.restoreDeleted(sb, snap), true),
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
      });
    },

    /** Toggle the done state (e.g. a checkbox). */
    toggleDone: (task: TaskRow) => {
      const done = task.status === "done";
      const prev: Partial<TaskInput> = {
        status: task.status,
        completedAt: task.completedAt,
      };
      return run(
        m.updateTask(sb, task.id, {
          status: done ? "todo" : "done",
          completedAt: done ? null : Date.now(),
        }),
        done ? "Task reopened" : "Task completed",
        {
          undo: (row) =>
            inverse(done ? "reopen" : "complete", () =>
              m.updateTask(sb, task.id, prev, row.updatedAt),
            ),
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
