"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTaskCheckpoints } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { TaskCheckpoint } from "@/lib/types";

/**
 * The workspace's flow milestone checkpoints, for the Flows view. Mirrors
 * use-task-status-events: its own realtime channel and a coarse
 * invalidate-on-change strategy. The set is tiny (a few markers per flow), and a
 * DELETE payload only carries the row's PK, so reconstructing a cache patch from
 * realtime isn't worth it — any change just refetches. The mutation hook keeps
 * the cache fresh between refetches via optimistic patches.
 */
export function useTaskCheckpoints(workspaceId: string | undefined): {
  checkpoints: TaskCheckpoint[];
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
        if (change.table !== "task_checkpoints") return;
        void qc.invalidateQueries({ queryKey: qk.taskCheckpoints(workspaceId) });
      },
      "task-checkpoints",
      {
        onStatus: (status, wasReconnect) => {
          // Reconcile any payloads missed while the channel was down.
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({
              queryKey: qk.taskCheckpoints(workspaceId),
            });
          } else if (status === "error") {
            console.warn(
              "[planner] Task checkpoints realtime channel error; the Flows view may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId
      ? qk.taskCheckpoints(workspaceId)
      : ["task-checkpoints", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchTaskCheckpoints(sb, workspaceId as string),
  });

  return {
    checkpoints: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
