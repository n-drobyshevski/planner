"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import type { TimeslotRequestRow } from "@/lib/types";

/**
 * Resolve a pending public-share timeslot request (Phase 4). Both actions
 * optimistically drop the row from the cached pending list — so the inbox row
 * leaves immediately — then write the new status to the DB, restoring the cache +
 * toasting on failure. Creating the *event* on approval is the caller's job (it
 * owns the event mutations); this hook only marks the request row resolved.
 */
export function useTimeslotRequests(workspaceId: string | undefined): {
  markApproved: (id: string) => Promise<boolean>;
  markDeclined: (id: string) => Promise<boolean>;
} {
  const qc = useQueryClient();

  const resolve = useCallback(
    async (id: string, status: "approved" | "declined"): Promise<boolean> => {
      if (!workspaceId) return false;
      const key = qk.timeslotRequests(workspaceId);
      const prev = qc.getQueryData<TimeslotRequestRow[]>(key);
      qc.setQueryData<TimeslotRequestRow[]>(key, (old) =>
        (old ?? []).filter((r) => r.id !== id),
      );
      const { error } = await createClient()
        .from("timeslot_requests")
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(error.message || "Couldn't update the request.");
        return false;
      }
      return true;
    },
    [workspaceId, qc],
  );

  return {
    markApproved: useCallback((id: string) => resolve(id, "approved"), [resolve]),
    markDeclined: useCallback((id: string) => resolve(id, "declined"), [resolve]),
  };
}
