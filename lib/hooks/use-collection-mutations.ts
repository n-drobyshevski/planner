"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import type { FlowLineStyle } from "@/lib/tasks/flow-line-styles";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";
import {
  patchWorkspace,
  patchCollectionById,
  removeCollectionById,
} from "@/lib/hooks/use-workspace-cache";

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Collection write operations wrapped with cache invalidation + toasts.
 * Collections live in the workspace bundle, so every change invalidates the
 * workspace query; realtime invalidates it too so the other member sees
 * collections live. Successful writes push an inverse onto the history store so
 * Ctrl+Z can undo.
 */
export function useCollectionMutations() {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const notify = useNotify();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.workspace });
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
          toast.error(e instanceof Error ? e.message : "Couldn't undo");
          return false;
        }),
  });

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    opts?: {
      undo?: (result: T) => UndoSpec | null;
      /** Apply an optimistic cache patch now; returns the rollback for the catch. */
      optimistic?: () => () => void;
    },
  ): Promise<boolean> {
    const rollback = opts?.optimistic?.();
    try {
      const result = await p;
      invalidate();
      const spec = opts?.undo?.(result) ?? null;
      if (spec) pushUndo(spec);
      notify.success(okMsg);
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    /** Create a collection; resolves to its new id, or null on failure. */
    create: async (input: {
      workspaceId: string;
      ownerId: string | null;
      name: string;
      color: string;
      lineStyle?: FlowLineStyle;
      sortOrder?: number;
    }): Promise<string | null> => {
      try {
        const id = await m.createCollection(sb, input);
        invalidate();
        pushUndo(inverse("create", () => m.deleteCollection(sb, id)));
        notify.success("Collection created");
        return id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return null;
      }
    },

    update: (
      id: string,
      patch: { name?: string; color?: string; lineStyle?: FlowLineStyle; sortOrder?: number },
    ) =>
      run(m.updateCollection(sb, id, patch), "Collection updated", {
        optimistic: () => patchWorkspace(qc, patchCollectionById(id, patch)),
      }),

    setShared: (id: string, ownerId: string | null) =>
      run(
        m.setCollectionOwner(sb, id, ownerId),
        ownerId === null ? "Collection shared" : "Collection made personal",
        { optimistic: () => patchWorkspace(qc, patchCollectionById(id, { ownerId })) },
      ),

    /** Delete a collection (blocked if it still holds tasks). Returns success. */
    remove: (id: string) =>
      run(m.deleteCollection(sb, id), "Collection deleted", {
        undo: (collection) => inverse("delete", () => m.restoreCollection(sb, collection)),
        optimistic: () => patchWorkspace(qc, removeCollectionById(id)),
      }),
  };
}
