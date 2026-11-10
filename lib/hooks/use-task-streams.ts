"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { fetchTaskStreams } from "@/lib/supabase/queries";
import {
  createTaskStream,
  deleteTaskStream,
  updateTaskStream,
} from "@/lib/supabase/mutations";
import { subscribeWorkspace } from "@/lib/supabase/realtime";
import { qk } from "@/lib/supabase/query-keys";
import type { TaskStreamPatch } from "@/lib/supabase/mappers";
import type { FlowsDisplay } from "@/lib/tasks/flows-display";
import type { TaskStream } from "@/lib/types";

// The data hooks below are channel-free, like use-insights-views.ts; the
// realtime subscription is useTaskStreamsRealtime, called once by the Flows
// shell so a tab using several of these hooks opens one channel.

/**
 * Realtime invalidation for task_streams. RLS keeps the partner's streams
 * out; deletes arrive as row_gone broadcasts, handed over as DELETE-shaped
 * changes with `table: "task_streams"`, so the same branch covers them.
 */
export function useTaskStreamsRealtime(
  workspaceId: string | undefined,
  memberId: string | undefined,
): void {
  const qc = useQueryClient();
  const sb = createClient();

  useEffect(() => {
    if (!workspaceId || !memberId) return;
    const invalidate = () =>
      void qc.invalidateQueries({
        queryKey: qk.taskStreams(workspaceId, memberId),
      });
    return subscribeWorkspace(
      sb,
      workspaceId,
      (change) => {
        if (change.table === "task_streams") invalidate();
      },
      "task-streams",
      {
        onStatus: (status, wasReconnect) => {
          if (status === "subscribed" && wasReconnect) {
            invalidate();
          } else if (status === "error") {
            console.warn(
              "[planner] Saved streams realtime channel error; live updates may lag until it reconnects.",
            );
          }
        },
      },
    );
  }, [workspaceId, memberId, qc, sb]);
}

/** The viewer's saved Flows streams (member-private under RLS), in list order. */
export function useTaskStreams(
  workspaceId: string | undefined,
  memberId: string | undefined,
): {
  streams: TaskStream[];
  isLoading: boolean;
  isError: boolean;
} {
  const sb = createClient();
  const query = useQuery({
    queryKey:
      workspaceId && memberId
        ? qk.taskStreams(workspaceId, memberId)
        : ["task-streams", "disabled"],
    enabled: Boolean(workspaceId && memberId),
    queryFn: () =>
      fetchTaskStreams(sb, workspaceId as string, memberId as string),
  });
  return {
    streams: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Save the current Flows display under a name. Appends after the member's
 * last stream; optimistic, rolled back with a toast on failure (including a
 * name the member already uses). Resolves to the saved row, or null when
 * there is no workspace/member yet.
 */
export function useCreateTaskStream(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (name: string, definition: FlowsDisplay) => Promise<TaskStream | null> {
  const qc = useQueryClient();

  return useCallback(
    async (name, definition) => {
      if (!workspaceId || !memberId) return null;
      const key = qk.taskStreams(workspaceId, memberId);
      const prev = qc.getQueryData<TaskStream[]>(key);
      const position = (prev ?? []).reduce(
        (max, s) => Math.max(max, s.position + 1),
        0,
      );
      const now = Date.now();
      const provisional: TaskStream = {
        id: `optimistic:${name}:${position}`,
        workspaceId,
        memberId,
        name: name.trim(),
        definition,
        position,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<TaskStream[]>(key, (old) => [...(old ?? []), provisional]);
      try {
        const saved = await createTaskStream(createClient(), {
          workspaceId,
          memberId,
          name,
          definition,
          position,
        });
        qc.setQueryData<TaskStream[]>(key, (old) =>
          (old ?? []).map((s) => (s.id === provisional.id ? saved : s)),
        );
        return saved;
      } catch (e) {
        qc.setQueryData<TaskStream[]>(key, (old) =>
          (old ?? []).filter((s) => s.id !== provisional.id),
        );
        toast.error(e instanceof Error ? e.message : "Couldn't save the stream");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/**
 * Rename a stream and/or replace its definition. Optimistic, rolled back with
 * a toast on failure.
 */
export function useUpdateTaskStream(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (streamId: string, patch: TaskStreamPatch) => Promise<TaskStream | null> {
  const qc = useQueryClient();

  return useCallback(
    async (streamId, patch) => {
      if (!workspaceId || !memberId) return null;
      const key = qk.taskStreams(workspaceId, memberId);
      const prev = qc.getQueryData<TaskStream[]>(key);
      qc.setQueryData<TaskStream[]>(key, (old) =>
        (old ?? []).map((s) =>
          s.id === streamId
            ? {
                ...s,
                ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                ...(patch.definition !== undefined
                  ? { definition: patch.definition }
                  : {}),
                updatedAt: Date.now(),
              }
            : s,
        ),
      );
      try {
        const saved = await updateTaskStream(createClient(), streamId, patch);
        qc.setQueryData<TaskStream[]>(key, (old) =>
          (old ?? []).map((s) => (s.id === streamId ? saved : s)),
        );
        return saved;
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't update the stream");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}

/** Remove one saved stream. Optimistic, rolled back with a toast on failure. */
export function useDeleteTaskStream(
  workspaceId: string | undefined,
  memberId: string | undefined,
): (streamId: string) => Promise<void> {
  const qc = useQueryClient();

  return useCallback(
    async (streamId) => {
      if (!workspaceId || !memberId) return;
      const key = qk.taskStreams(workspaceId, memberId);
      const prev = qc.getQueryData<TaskStream[]>(key);
      qc.setQueryData<TaskStream[]>(key, (old) =>
        (old ?? []).filter((s) => s.id !== streamId),
      );
      try {
        await deleteTaskStream(createClient(), streamId);
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        toast.error(e instanceof Error ? e.message : "Couldn't delete the stream");
        throw e;
      }
    },
    [workspaceId, memberId, qc],
  );
}
