"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchInsightsPrefs } from "@/lib/supabase/queries";
import { upsertInsightsPrefs } from "@/lib/supabase/mutations";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { InsightsPrefs } from "@/lib/types";

/** Fallback prefs before the member ever customizes (no row yet). */
export const DEFAULT_INSIGHTS_PREFS: Pick<
  InsightsPrefs,
  "dashboard" | "suppressedKinds"
> = {
  dashboard: {},
  suppressedKinds: [],
};

/**
 * One realtime subscription for ALL Insights customization tables
 * (category_goals, insights_views, insights_prefs) — called once by the
 * insights shell, the useWorkspaceRealtime/useWindowEvents split: data hooks
 * below stay channel-free so a tab using two of them doesn't open two
 * websocket channels. RLS keeps the partner's views/prefs rows out; goals are
 * workspace-shared so both members receive them.
 */
export function useInsightsCustomizationRealtime(
  workspaceId: string | undefined,
  memberId: string | undefined,
): void {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId || !memberId) return;
    const invalidateAll = () => {
      void qc.invalidateQueries({ queryKey: qk.categoryGoals(workspaceId) });
      void qc.invalidateQueries({
        queryKey: qk.insightsViews(workspaceId, memberId),
      });
      void qc.invalidateQueries({
        queryKey: qk.insightsPrefs(workspaceId, memberId),
      });
    };
    return subscribeWorkspace(
      sb,
      workspaceId,
      (change) => {
        if (change.table === "category_goals") {
          void qc.invalidateQueries({ queryKey: qk.categoryGoals(workspaceId) });
        } else if (change.table === "insights_views") {
          void qc.invalidateQueries({
            queryKey: qk.insightsViews(workspaceId, memberId),
          });
        } else if (change.table === "insights_prefs") {
          void qc.invalidateQueries({
            queryKey: qk.insightsPrefs(workspaceId, memberId),
          });
        }
      },
      "insights-custom",
      {
        onStatus: (status, wasReconnect) => {
          if (status === "subscribed" && wasReconnect) {
            invalidateAll();
          } else if (status === "error") {
            console.warn(
              "[planner] Insights customization realtime channel error; live updates may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, memberId, qc, sb]);
}

/**
 * The viewer's Insights prefs (dashboard layout + suppressed suggestion
 * kinds). `prefs` is null until loaded AND before first customization —
 * callers treat null as DEFAULT_INSIGHTS_PREFS.
 */
export function useInsightsPrefs(
  workspaceId: string | undefined,
  memberId: string | undefined,
): {
  prefs: InsightsPrefs | null;
  isLoading: boolean;
  isError: boolean;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey:
      workspaceId && memberId
        ? qk.insightsPrefs(workspaceId, memberId)
        : ["insights-prefs", "disabled"],
    enabled: Boolean(workspaceId && memberId),
    queryFn: () =>
      fetchInsightsPrefs(sb, workspaceId as string, memberId as string),
  });
  return {
    prefs: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Merge a partial prefs change (dashboard and/or suppressedKinds). Optimistic:
 * the cache row updates immediately, the server row replaces it on success,
 * and the previous cache is restored + a toast shown on failure.
 */
export function useUpdateInsightsPrefs(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (
  patch: Partial<Pick<InsightsPrefs, "dashboard" | "suppressedKinds">>,
) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (patch) => {
      if (!workspaceId || !memberId) return;
      const key = qk.insightsPrefs(workspaceId, memberId);
      const prev = qc.getQueryData<InsightsPrefs | null>(key);
      const provisional: InsightsPrefs = {
        memberId,
        workspaceId,
        dashboard: patch.dashboard ?? prev?.dashboard ?? {},
        suppressedKinds: patch.suppressedKinds ?? prev?.suppressedKinds ?? [],
        updatedAt: Date.now(),
      };
      qc.setQueryData<InsightsPrefs | null>(key, provisional);
      try {
        const saved = await upsertInsightsPrefs(
          createClient(),
          workspaceId,
          memberId,
          patch,
        );
        qc.setQueryData<InsightsPrefs | null>(key, saved);
      } catch (e) {
        qc.setQueryData(key, prev ?? null);
        toast.error(
          e instanceof Error ? e.message : "Couldn't save your preferences",
        );
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}
