"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchInsightsViews } from "@/lib/supabase/queries";
import { createInsightsView, deleteInsightsView } from "@/lib/supabase/mutations";
import { qk } from "@/lib/supabase/query-keys";
import { encodeViewConfig, type SavedViewConfig } from "@/lib/insights/views";
import type { InsightsView } from "@/lib/types";

// Realtime invalidation for insights_views lives in
// useInsightsCustomizationRealtime (use-insights-prefs.ts), subscribed once by
// the insights shell — these hooks are intentionally channel-free.

/** The viewer's saved Insights views (member-private under RLS). */
export function useInsightsViews(
  workspaceId: string | undefined,
  memberId: string | undefined,
): {
  views: InsightsView[];
  isLoading: boolean;
  isError: boolean;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey:
      workspaceId && memberId
        ? qk.insightsViews(workspaceId, memberId)
        : ["insights-views", "disabled"],
    enabled: Boolean(workspaceId && memberId),
    queryFn: () =>
      fetchInsightsViews(sb, workspaceId as string, memberId as string),
  });
  return {
    views: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Save the current slice under a name. Appends after the member's last view;
 * optimistic, rolled back with a toast on failure.
 */
export function useCreateInsightsView(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (name: string, config: SavedViewConfig) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (name, config) => {
      if (!workspaceId || !memberId) return;
      const key = qk.insightsViews(workspaceId, memberId);
      const prev = qc.getQueryData<InsightsView[]>(key);
      const position = (prev ?? []).reduce((max, v) => Math.max(max, v.position + 1), 0);
      const encoded = encodeViewConfig(config);
      const provisional: InsightsView = {
        id: `optimistic:${name}:${position}`,
        workspaceId,
        memberId,
        name,
        config: encoded,
        position,
        createdAt: Date.now(),
      };
      qc.setQueryData<InsightsView[]>(key, (old) => [...(old ?? []), provisional]);
      try {
        const saved = await createInsightsView(createClient(), {
          workspaceId,
          memberId,
          name,
          config: encoded,
          position,
        });
        qc.setQueryData<InsightsView[]>(key, (old) =>
          (old ?? []).map((v) => (v.id === provisional.id ? saved : v)),
        );
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't save the view");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/** Remove one saved view. Optimistic, rolled back with a toast on failure. */
export function useDeleteInsightsView(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (viewId: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (viewId) => {
      if (!workspaceId || !memberId) return;
      const key = qk.insightsViews(workspaceId, memberId);
      const prev = qc.getQueryData<InsightsView[]>(key);
      qc.setQueryData<InsightsView[]>(key, (old) =>
        (old ?? []).filter((v) => v.id !== viewId),
      );
      try {
        await deleteInsightsView(createClient(), viewId);
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't delete the view");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}
