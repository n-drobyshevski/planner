"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTaskStatusEvents } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { TaskStatusEvent } from "@/lib/types";

/**
 * The workspace's task status-change history, for the Flows view. Mirrors
 * use-tasks but on its own channel and with a coarser realtime strategy: status
 * events are append-only and cascade-delete with their task, and a DELETE
 * payload only carries the row's PK (not its task_id), so reconstructing the
 * cache patch isn't worth it. Volume is tiny (two users, a few rows per task),
 * so any change just invalidates and refetches.
 */
export function useTaskStatusEvents(workspaceId: string | undefined): {
  events: TaskStatusEvent[];
  isLoading: boolean;
  isError: boolean;
} {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeWorkspace(
      sb,
      workspaceId,
      (change) => {
        if (change.table !== "task_status_events") return;
        void qc.invalidateQueries({ queryKey: qk.taskStatusEvents(workspaceId) });
      },
      "task-status-events",
      {
        onStatus: (status, wasReconnect) => {
          // Reconcile any payloads missed while the channel was down.
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({
              queryKey: qk.taskStatusEvents(workspaceId),
            });
          } else if (status === "error") {
            console.warn(
              "[planner] Task status-events realtime channel error; the Flows view may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId
      ? qk.taskStatusEvents(workspaceId)
      : ["task-status-events", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchTaskStatusEvents(sb, workspaceId as string),
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
