"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchCategoryGoals } from "@/lib/supabase/queries";
import { deleteCategoryGoal, upsertCategoryGoal } from "@/lib/supabase/mutations";
import type { CategoryGoalInput } from "@/lib/supabase/mappers";
import { qk } from "@/lib/supabase/query-keys";
import type { CategoryGoal } from "@/lib/types";

// Realtime invalidation for category_goals lives in
// useInsightsCustomizationRealtime (use-insights-prefs.ts), subscribed once by
// the insights shell — these hooks are intentionally channel-free.

/** All per-category weekly goals of the workspace (both members see them). */
export function useCategoryGoals(workspaceId: string | undefined): {
  goals: CategoryGoal[];
  isLoading: boolean;
  isError: boolean;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey: workspaceId
      ? qk.categoryGoals(workspaceId)
      : ["category-goals", "disabled"],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchCategoryGoals(sb, workspaceId as string),
  });
  return {
    goals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Create or replace one category's goal (conflict key workspace×category).
 * Optimistic: replace-or-insert by category id, rolled back with a toast on
 * failure (use-sleep-logs pattern).
 */
export function useUpsertCategoryGoal(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (input: Omit<CategoryGoalInput, "workspaceId" | "createdBy">) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (input) => {
      if (!workspaceId || !memberId) return;
      const key = qk.categoryGoals(workspaceId);
      const prev = qc.getQueryData<CategoryGoal[]>(key);
      const provisional: CategoryGoal = {
        id: `optimistic:${input.categoryId}`,
        workspaceId,
        categoryId: input.categoryId,
        weeklyTargetMs: input.weeklyTargetMs,
        direction: input.direction ?? "at-least",
        createdBy: memberId,
        createdAt: Date.now(),
      };
      const upsertInto = (goals: CategoryGoal[], row: CategoryGoal) => [
        ...goals.filter((g) => g.categoryId !== row.categoryId),
        row,
      ];
      qc.setQueryData<CategoryGoal[]>(key, (old) =>
        upsertInto(old ?? [], provisional),
      );
      try {
        const saved = await upsertCategoryGoal(createClient(), {
          ...input,
          workspaceId,
          createdBy: memberId,
        });
        qc.setQueryData<CategoryGoal[]>(key, (old) => upsertInto(old ?? [], saved));
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't save the goal");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/** Remove one goal. Optimistic, rolled back with a toast on failure. */
export function useDeleteCategoryGoal(
  workspaceId: string | undefined,
): (goalId: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (goalId) => {
      if (!workspaceId) return;
      const key = qk.categoryGoals(workspaceId);
      const prev = qc.getQueryData<CategoryGoal[]>(key);
      qc.setQueryData<CategoryGoal[]>(key, (old) =>
        (old ?? []).filter((g) => g.id !== goalId),
      );
      try {
        await deleteCategoryGoal(createClient(), goalId);
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't remove the goal");
        throw e;
      }
    },
    [workspaceId, qc],
  );
}
