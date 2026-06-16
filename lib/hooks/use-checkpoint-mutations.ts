"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import { upsertCheckpoint, removeCheckpoint } from "@/lib/tasks/checkpoint-cache";
import type { CheckpointInput } from "@/lib/supabase/mappers";
import type { TaskCheckpoint } from "@/lib/types";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Flow-checkpoint write operations wrapped with optimistic cache patches, undo,
 * and toasts — the same scaffold as use-task-mutations, against the
 * ["task-checkpoints", workspaceId] cache. Successful writes apply the returned
 * server row; the data hook's realtime reconciles for the other member.
 */
export function useCheckpointMutations(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const runUndo = useHistoryStore((s) => s.runUndo);
  const notify = useNotify();
  const t = useTranslations("toasts");
  const tc = useTranslations("common");

  const invalidate = () => {
    if (!workspaceId) return;
    qc.invalidateQueries({ queryKey: qk.taskCheckpoints(workspaceId) });
  };
  const setCheckpoints = (
    updater: (old: TaskCheckpoint[]) => TaskCheckpoint[],
  ) => {
    if (!workspaceId) return;
    qc.setQueryData<TaskCheckpoint[]>(qk.taskCheckpoints(workspaceId), (old) =>
      old ? updater(old) : old,
    );
  };

  const patchCheckpointCache = (
    id: string,
    patch: (c: TaskCheckpoint) => TaskCheckpoint,
  ) => {
    if (!workspaceId) return () => {};
    const key = qk.taskCheckpoints(workspaceId);
    const prev = qc.getQueryData<TaskCheckpoint[]>(key);
    qc.setQueryData<TaskCheckpoint[]>(key, (old) =>
      old?.map((c) => (c.id === id ? patch(c) : c)),
    );
    return () => qc.setQueryData(key, prev);
  };
  const removeFromCache = (id: string) => {
    if (!workspaceId) return () => {};
    const key = qk.taskCheckpoints(workspaceId);
    const prev = qc.getQueryData<TaskCheckpoint[]>(key);
    qc.setQueryData<TaskCheckpoint[]>(key, (old) =>
      old ? removeCheckpoint(old, id) : old,
    );
    return () => qc.setQueryData(key, prev);
  };

  /** Wrap a raw inverse op: invalidate on success, toast + false on failure. */
  const inverse = (label: string, op: () => Promise<unknown>): UndoSpec => ({
    label,
    undo: () =>
      op()
        .then(() => {
          invalidate();
          return true;
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : t("couldntUndo"));
          return false;
        }),
  });

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    opts?: {
      undo?: (result: T) => UndoSpec | null;
      optimistic?: () => () => void;
      apply?: (result: T) => void;
    },
  ): Promise<boolean> {
    const rollback = opts?.optimistic?.();
    try {
      const result = await p;
      if (opts?.apply) opts.apply(result);
      else invalidate();
      const spec = opts?.undo?.(result) ?? null;
      if (spec) pushUndo(spec);
      notify.success(
        okMsg,
        spec ? { action: { label: tc("undo"), onClick: () => void runUndo() } } : undefined,
      );
      return true;
    } catch (e) {
      rollback?.();
      toast.error(e instanceof Error ? e.message : tc("somethingWentWrong"));
      return false;
    }
  }

  return {
    create: (input: CheckpointInput) =>
      run(m.createCheckpoint(sb, input), t("checkpointCreated"), {
        undo: (row) =>
          inverse(t("undoLabel.create"), () => m.deleteCheckpoint(sb, row.id)),
        apply: (row) => setCheckpoints((old) => upsertCheckpoint(old, row)),
      }),

    update: (
      cp: TaskCheckpoint,
      patch: Partial<CheckpointInput>,
      prev: Partial<CheckpointInput>,
      optimisticRowPatch?: Partial<TaskCheckpoint>,
    ) =>
      run(m.updateCheckpoint(sb, cp.id, patch), t("checkpointUpdated"), {
        undo: () =>
          inverse(t("undoLabel.edit"), () => m.updateCheckpoint(sb, cp.id, prev)),
        optimistic: optimisticRowPatch
          ? () => patchCheckpointCache(cp.id, (c) => ({ ...c, ...optimisticRowPatch }))
          : undefined,
        apply: (row) => setCheckpoints((old) => upsertCheckpoint(old, row)),
      }),

    /** Toggle reached, stamping reached_at (parity with task completion). */
    toggleReached: (cp: TaskCheckpoint) => {
      const next = !cp.reached;
      const nextReachedAt = next ? Date.now() : null;
      return run(
        m.updateCheckpoint(sb, cp.id, { reached: next, reachedAt: nextReachedAt }),
        next ? t("checkpointReached") : t("checkpointReopened"),
        {
          optimistic: () =>
            patchCheckpointCache(cp.id, (c) => ({
              ...c,
              reached: next,
              reachedAt: nextReachedAt,
            })),
          undo: () =>
            inverse(next ? t("undoLabel.complete") : t("undoLabel.reopen"), () =>
              m.updateCheckpoint(sb, cp.id, {
                reached: cp.reached,
                reachedAt: cp.reachedAt,
              }),
            ),
          apply: (row) => setCheckpoints((old) => upsertCheckpoint(old, row)),
        },
      );
    },

    remove: (cp: TaskCheckpoint) =>
      run(m.deleteCheckpoint(sb, cp.id), t("checkpointDeleted"), {
        optimistic: () => removeFromCache(cp.id),
        undo: (rawRow) =>
          inverse(t("undoLabel.delete"), () => m.restoreCheckpoint(sb, rawRow)),
        apply: () => setCheckpoints((old) => removeCheckpoint(old, cp.id)),
      }),
  };
}
