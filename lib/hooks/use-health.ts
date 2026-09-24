"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { createClient } from "@/lib/supabase/client";
import { fetchHealthConnection, fetchHealthDaily } from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import type { HealthConnection, HealthDaily } from "@/lib/types";

/**
 * The viewer's Google Health connection (settings card): status, last sync,
 * last error — never the secret token, which the DB never even lets the
 * browser select (see 20260724000000_health_sync.sql). `connection: null`
 * means never connected.
 */
export function useHealthConnection(memberId: string | undefined): {
  connection: HealthConnection | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey: memberId ? qk.healthConnection(memberId) : ["health-connection", "disabled"],
    enabled: Boolean(memberId),
    queryFn: () => fetchHealthConnection(sb, memberId as string),
  });
  return { connection: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
}

/** Force-refetch the connection row — used right after "Sync now"/disconnect. */
export function useInvalidateHealthConnection(): (memberId: string) => Promise<void> {
  const qc = useQueryClient();
  return useCallback(
    async (memberId: string) => {
      await qc.invalidateQueries({ queryKey: qk.healthConnection(memberId) });
    },
    [qc],
  );
}

/** The viewer's synced health metrics for [startDate, endDate] (zone-free tokens). */
export function useHealthDaily(
  memberId: string | undefined,
  startDate: string,
  endDate: string,
): { days: HealthDaily[]; isLoading: boolean } {
  const sb = createClient();
  const query = useQuery({
    queryKey: memberId
      ? qk.healthDaily(memberId, startDate, endDate)
      : ["health-daily", "disabled"],
    enabled: Boolean(memberId),
    queryFn: () => fetchHealthDaily(sb, memberId as string, startDate, endDate),
  });
  return { days: query.data ?? [], isLoading: query.isLoading };
}
