"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWindow } from "@/lib/supabase/queries";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import { expandEvents } from "@/lib/recurrence/expand";
import type { EventRow, Occurrence, TimeWindow } from "@/lib/types";

/**
 * Fetch events + overrides for a visible window, expand them into occurrences,
 * and live-invalidate on any realtime change in the workspace.
 */
export function useWindowEvents(
  workspaceId: string | undefined,
  win: TimeWindow,
): {
  occurrences: Occurrence[];
  events: EventRow[];
  isLoading: boolean;
  isError: boolean;
} {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeWorkspace(sb, workspaceId, () => {
      qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
    });
  }, [workspaceId, qc, sb]);

  const query = useQuery({
    queryKey: workspaceId
      ? qk.window(workspaceId, win.start, win.end)
      : ["events", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchWindow(sb, workspaceId as string, win),
  });

  const occurrences = useMemo<Occurrence[]>(
    () =>
      query.data
        ? expandEvents(query.data.events, query.data.overrides, win)
        : [],
    // win identity changes each render; depend on its primitive bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, win.start, win.end],
  );

  return {
    occurrences,
    events: query.data?.events ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
