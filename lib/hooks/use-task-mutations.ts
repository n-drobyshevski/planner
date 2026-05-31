"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { TaskInput } from "@/lib/supabase/mappers";
import type { TaskRow } from "@/lib/types";

/**
 * Task write operations wrapped with cache invalidation + toasts. Realtime
 * also invalidates, so the other member sees changes live. Scheduling touches
 * the events table too, so those calls invalidate both task and event queries.
 */
export function useTaskMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();

  const invalidate = (alsoEvents = false) => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) });
    if (alsoEvents) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    opts?: { alsoEvents?: boolean },
  ): Promise<boolean> {
    try {
      await p;
      invalidate(opts?.alsoEvents);
      toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    create: (input: TaskInput) => run(m.createTask(sb, input), "Task created"),
    update: (id: string, patch: Partial<TaskInput>) =>
      run(m.updateTask(sb, id, patch), "Task updated"),
    remove: (id: string) => run(m.deleteTask(sb, id), "Task deleted"),

    /** Move to a status column at a new position; manages completed_at on transition. */
    move: (task: TaskRow, status: TaskRow["status"], position: number) => {
      const patch: Partial<TaskInput> = { status, position };
      if (status !== task.status) {
        if (status === "done") patch.completedAt = Date.now();
        else if (task.status === "done") patch.completedAt = null;
      }
      return run(m.updateTask(sb, task.id, patch), "Task moved");
    },

    /** Toggle the done state (e.g. a checkbox). */
    toggleDone: (task: TaskRow) => {
      const done = task.status === "done";
      return run(
        m.updateTask(sb, task.id, {
          status: done ? "todo" : "done",
          completedAt: done ? null : Date.now(),
        }),
        done ? "Task reopened" : "Task completed",
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
      }),

    /** Schedule blocks that each link to their own task (e.g. subtasks). */
    scheduleMany: (
      items: { task: TaskRow; start: number; end: number; title?: string }[],
      timeZone: string,
    ) =>
      run(m.scheduleBlocks(sb, items, timeZone), "Added to calendar", {
        alsoEvents: true,
      }),
  };
}
