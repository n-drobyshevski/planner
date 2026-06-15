"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTasks } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import { applyTaskChange } from "@/lib/tasks/cache";
import type { TaskRow } from "@/lib/types";

/**
 * Fetch all tasks (+ subtasks) for the workspace and apply realtime changes
 * directly to the cache (the payload carries the row, so no refetch is
 * needed). Mirrors use-window-events but is not windowed — the board and list
 * need the full set.
 *
 * Known gap (unchanged from the invalidate days): when a task flips to
 * private, RLS stops delivering its events to the partner — no payload, so
 * the stale row lingers until the next refetch (window refocus or reconnect).
 */
export function useTasks(workspaceId: string | undefined): {
  tasks: TaskRow[];
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
        // Collection/board changes alter the switcher / columns / which tasks are
        // in scope, and both live in the workspace bundle — refresh it so the
        // other member sees new/removed collections and columns live.
        if (change.table === "collections" || change.table === "boards") {
          qc.invalidateQueries({ queryKey: qk.workspace });
          return;
        }
        // Only react to task changes otherwise; event/override/category changes
        // on this shared channel are not this list's concern.
        if (change.table !== "tasks") return;
        qc.setQueryData<TaskRow[]>(qk.tasks(workspaceId), (old) =>
          old ? applyTaskChange(old, change) : old,
        );
      },
      "tasks",
      {
        onStatus: (status, wasReconnect) => {
          // Payloads may have been missed while the channel was down; refetch
          // once on rejoin to reconcile. Errors are logged, not surfaced — the
          // client auto-reconnects and the app stays calm.
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) });
          } else if (status === "error") {
            console.warn("[planner] Tasks realtime channel error; live updates may lag until it reconnects.");
          }
        },
      },
    );
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId ? qk.tasks(workspaceId) : ["tasks", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchTasks(sb, workspaceId as string),
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
