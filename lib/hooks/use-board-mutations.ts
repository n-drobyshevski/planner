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
  patchBoardById,
  removeBoardById,
} from "@/lib/hooks/use-workspace-cache";

/** A reversible action: a label for the toast + the inverse to run. */
type UndoSpec = { label: string; undo: () => Promise<boolean> };

/**
 * Board write operations wrapped with cache invalidation + toasts. Boards live
 * in the workspace bundle, so every change invalidates the workspace query;
 * realtime invalidates it too so the other member sees boards live. Successful
 * writes push an inverse onto the history store so Ctrl+Z can undo.
 */
export function useBoardMutations() {
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
    /** Create a board; resolves to its new id, or null on failure. */
    create: async (input: {
      workspaceId: string;
      ownerId: string | null;
      name: string;
      color: string;
      lineStyle?: FlowLineStyle;
      sortOrder?: number;
    }): Promise<string | null> => {
      try {
        const id = await m.createBoard(sb, input);
        invalidate();
        pushUndo(inverse("create", () => m.deleteBoard(sb, id)));
        notify.success("Board created");
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
      run(m.updateBoard(sb, id, patch), "Board updated", {
        optimistic: () => patchWorkspace(qc, patchBoardById(id, patch)),
      }),

    setShared: (id: string, ownerId: string | null) =>
      run(
        m.setBoardOwner(sb, id, ownerId),
        ownerId === null ? "Board shared" : "Board made personal",
        { optimistic: () => patchWorkspace(qc, patchBoardById(id, { ownerId })) },
      ),

    /** Delete a board (blocked if it still holds tasks). Returns success. */
    remove: (id: string) =>
      run(m.deleteBoard(sb, id), "Board deleted", {
        undo: (board) => inverse("delete", () => m.restoreBoard(sb, board)),
        optimistic: () => patchWorkspace(qc, removeBoardById(id)),
      }),
  };
}
