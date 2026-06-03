"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchTasks } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { TaskRow } from "@/lib/types";

/**
 * Fetch all tasks (+ subtasks) for the workspace and live-invalidate on any
 * realtime change. Mirrors use-window-events but is not windowed — the board
 * and list need the full set.
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
        // Board changes alter the switcher / which tasks are in scope, and
        // boards live in the workspace bundle — refresh it so the other member
        // sees new/removed boards live.
        if (change.table === "boards") {
          qc.invalidateQueries({ queryKey: qk.workspace });
          return;
        }
        // Only react to task changes otherwise; event/override/category changes
        // on this shared channel are not this list's concern.
        if (change.table !== "tasks") return;
        qc.invalidateQueries({ queryKey: qk.tasks(workspaceId) });
      },
      "tasks",
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
