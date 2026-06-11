"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchSleepLogs } from "@/lib/supabase/queries";
import { deleteSleepLog, upsertSleepLog } from "@/lib/supabase/mutations";
import type { SleepLogInput } from "@/lib/supabase/mappers";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { SleepLog } from "@/lib/types";

/**
 * The viewer's sleep logs (member-private under RLS — the partner's rows are
 * never delivered, by query or realtime). Mirrors use-tasks, but invalidates
 * instead of cache-patching: this is single-writer data and the refetch is one
 * tiny query, so the realtime payload only acts as a cross-device "changed"
 * signal.
 */
export function useSleepLogs(
  workspaceId: string | undefined,
  memberId: string | undefined,
): {
  logs: SleepLog[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId || !memberId) return;
    return subscribeWorkspace(
      sb,
      workspaceId,
      (change) => {
        if (change.table !== "sleep_logs") return;
        void qc.invalidateQueries({
          queryKey: qk.sleepLogs(workspaceId, memberId),
        });
      },
      "sleep",
      {
        onStatus: (status, wasReconnect) => {
          if (status === "subscribed" && wasReconnect) {
            void qc.invalidateQueries({
              queryKey: qk.sleepLogs(workspaceId, memberId),
            });
          } else if (status === "error") {
            console.warn(
              "[planner] Sleep realtime channel error; live updates may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, memberId, qc, sb]);

  const query = useQuery({
    queryKey:
      workspaceId && memberId
        ? qk.sleepLogs(workspaceId, memberId)
        : ["sleep-logs", "disabled"],
    enabled: Boolean(workspaceId && memberId),
    queryFn: () => fetchSleepLogs(sb, workspaceId as string, memberId as string),
  });

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Upsert one night (check-in or backfill; unique member_id,date). Optimistic:
 * the cache gets a provisional row immediately (replace-or-insert by date,
 * kept date-sorted), the server row replaces it on success, and the previous
 * cache is restored + a toast shown on failure (use-preferences pattern).
 */
/** Distinguishes overlapping optimistic rows when saves race (same date). */
let optimisticSeq = 0;

export function useUpsertSleepLog(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (input: Omit<SleepLogInput, "workspaceId" | "memberId">) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (input) => {
      if (!workspaceId || !memberId) return;
      const key = qk.sleepLogs(workspaceId, memberId);
      const prev = qc.getQueryData<SleepLog[]>(key);
      const full: SleepLogInput = { ...input, workspaceId, memberId };
      const provisional: SleepLog = {
        id: `optimistic:${input.date}:${++optimisticSeq}`,
        workspaceId,
        memberId,
        date: input.date,
        bedtimeAt: input.bedtimeAt ?? null,
        wokeAt: input.wokeAt ?? null,
        quality: input.quality ?? null,
        fatigue: input.fatigue ?? null,
        note: input.note ?? null,
        createdAt: Date.now(),
      };
      const upsertInto = (logs: SleepLog[], row: SleepLog) =>
        [...logs.filter((l) => l.date !== row.date), row].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        );
      qc.setQueryData<SleepLog[]>(key, (old) => upsertInto(old ?? [], provisional));
      try {
        const saved = await upsertSleepLog(createClient(), full);
        qc.setQueryData<SleepLog[]>(key, (old) => upsertInto(old ?? [], saved));
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(
          e instanceof Error ? e.message : "Couldn't save your sleep log",
        );
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/**
 * Delete one night's log (same optimistic shape as the upsert: remove from
 * cache immediately, restore + toast on failure).
 */
export function useDeleteSleepLog(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (date: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (date) => {
      if (!workspaceId || !memberId) return;
      const key = qk.sleepLogs(workspaceId, memberId);
      const prev = qc.getQueryData<SleepLog[]>(key);
      qc.setQueryData<SleepLog[]>(key, (old) =>
        (old ?? []).filter((l) => l.date !== date),
      );
      try {
        await deleteSleepLog(createClient(), memberId, date);
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(
          e instanceof Error ? e.message : "Couldn't delete the sleep log",
        );
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}
