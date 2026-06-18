"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTaskDependencies } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { TaskDependency } from "@/lib/types";

/**
 * The workspace's blocks/blocked-by dependency edges. Mirrors
 * use-task-checkpoints: its own realtime channel with a coarse
 * invalidate-on-change strategy (the set is tiny, and a DELETE payload carries
 * only the PK). The mutation hook keeps the cache fresh between refetches via
 * optimistic patches.
 */
export function useTaskDependencies(workspaceId: string | undefined): {
  dependencies: TaskDependency[];
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
        if (change.table !== "task_dependencies") return;
        void qc.invalidateQueries({ queryKey: qk.taskDependencies(workspaceId) });
      },
      "task-dependencies",
      {
        onStatus: (status, wasReconnect) => {
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({
              queryKey: qk.taskDependencies(workspaceId),
            });
          } else if (status === "error") {
            console.warn(
              "[planner] Task dependencies realtime channel error; blocked states may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId
      ? qk.taskDependencies(workspaceId)
      : ["task-dependencies", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchTaskDependencies(sb, workspaceId as string),
  });

  return {
    dependencies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
