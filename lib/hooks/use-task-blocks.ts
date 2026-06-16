"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTaskBlocks } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { EventRow } from "@/lib/types";

/**
 * The workspace's task-linked calendar blocks (events with a task_id), for the
 * Flows view's scheduled-block markers. Mirrors use-task-status-events on its
 * own channel: any change to the events table invalidates and refetches (task
 * blocks are few and non-recurring, so reconstructing a cache patch isn't worth
 * it). The query key sits under the `["events", id]` prefix, so the event
 * mutations' eventsAll invalidation also refreshes it.
 */
export function useTaskBlocks(workspaceId: string | undefined): {
  blocks: EventRow[];
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
        if (change.table !== "events") return;
        void qc.invalidateQueries({ queryKey: qk.taskBlocks(workspaceId) });
      },
      "task-blocks",
      {
        onStatus: (status, wasReconnect) => {
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({ queryKey: qk.taskBlocks(workspaceId) });
          } else if (status === "error") {
            console.warn(
              "[planner] Task-blocks realtime channel error; the Flows view's scheduled markers may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId ? qk.taskBlocks(workspaceId) : ["events", "task-blocks-disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchTaskBlocks(sb, workspaceId as string),
  });

  return {
    blocks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
