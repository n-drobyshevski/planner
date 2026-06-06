"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startOfDay, getTime } from "date-fns";
import { tz } from "@date-fns/tz";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";
import { useHistoryStore } from "@/stores/history-store";
import { useNotify } from "@/lib/hooks/use-notify";
import {
  patchWorkspace,
  patchCategoryById,
  removeCategoryById,
  patchMemberById,
} from "@/lib/hooks/use-workspace-cache";

const HOUR_MS = 3_600_000;

/**
 * Sidebar write operations (Contexts — internally the `categories` table — plus
 * the signed-in member's own calendar) wrapped with cache invalidation +
 * toasts, mirroring useEventMutations.
 *
 * Category renames/recolors invalidate the `qk.workspace` bundle (members +
 * categories, from which item colors derive). Deleting a Context also removes
 * its calendar time-blocks and unlinks its items, so that path additionally
 * invalidates events — and pushes an inverse so Ctrl+Z restores everything.
 */
export function useSidebarMutations(workspaceId?: string) {
  const qc = useQueryClient();
  const sb = createClient();
  const pushUndo = useHistoryStore((s) => s.push);
  const notify = useNotify();

  const invalidateWorkspace = () => qc.invalidateQueries({ queryKey: qk.workspace });
  const invalidateEvents = () => {
    if (workspaceId) qc.invalidateQueries({ queryKey: qk.eventsAll(workspaceId) });
  };

  async function run<T>(
    p: Promise<T>,
    okMsg: string,
    /** Apply an optimistic cache patch now; returns the rollback for the catch. */
    optimistic?: () => () => void,
  ): Promise<boolean> {
    const rollback = optimistic?.();
    try {
      await p;
      await invalidateWorkspace();
      notify.success(okMsg);
      return true;
    } catch (e) {
      rollback?.(); // restore the pre-patch snapshot on failure
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    renameCategory: (id: string, name: string) =>
      run(m.updateCategory(sb, id, { name }), "Context renamed", () =>
        patchWorkspace(qc, patchCategoryById(id, { name })),
      ),
    recolorCategory: (id: string, color: string) =>
      run(m.updateCategory(sb, id, { color }), "Context color updated", () =>
        patchWorkspace(qc, patchCategoryById(id, { color })),
      ),
    /**
     * Convert a Context between Shared (`ownerId = null`; events in it become
     * joint) and Personal (`ownerId = a member`). Also invalidates events so the
     * calendar re-derives each occurrence's `isShared`.
     */
    makeContextShared: async (id: string, ownerId: string | null): Promise<boolean> => {
      const ok = await run(
        m.setCategoryOwner(sb, id, ownerId),
        ownerId === null ? "Context shared" : "Context made personal",
        () => patchWorkspace(qc, patchCategoryById(id, { ownerId })),
      );
      if (ok) invalidateEvents();
      return ok;
    },
    /** Delete a Context, its calendar time-blocks, and unlink its items (undoable). */
    deleteCategory: async (id: string): Promise<boolean> => {
      const rollback = patchWorkspace(qc, removeCategoryById(id));
      try {
        const snap = await m.deleteCategory(sb, id);
        invalidateWorkspace();
        invalidateEvents();
        pushUndo({
          label: "delete context",
          undo: () =>
            m
              .restoreCategory(sb, snap)
              .then(() => {
                invalidateWorkspace();
                invalidateEvents();
                return true;
              })
              .catch((e) => {
                toast.error(e instanceof Error ? e.message : "Couldn't undo");
                return false;
              }),
        });
        notify.success("Context deleted");
        return true;
      } catch (e) {
        rollback(); // restore the removed context on failure
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },
    /** Give a Context a default time-block on today's calendar (09:00–12:00). */
    addContextWindow: async (
      categoryId: string,
      args: { ownerId: string; timeZone: string; title: string },
    ): Promise<boolean> => {
      if (!workspaceId) return false;
      const dayStart = getTime(startOfDay(Date.now(), { in: tz(args.timeZone) }));
      try {
        await m.createEvent(sb, {
          workspaceId,
          ownerId: args.ownerId,
          categoryId,
          kind: "context",
          title: args.title,
          allDay: false,
          start: dayStart + 9 * HOUR_MS,
          end: dayStart + 12 * HOUR_MS,
          timeZone: args.timeZone,
        });
        invalidateEvents();
        notify.success("Added to calendar");
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },

    renameMember: (id: string, name: string) =>
      run(m.updateMember(sb, id, { name }), "Calendar renamed", () =>
        patchWorkspace(qc, patchMemberById(id, { name })),
      ),
    recolorMember: (id: string, color: string) =>
      run(m.updateMember(sb, id, { color }), "Calendar color updated", () =>
        patchWorkspace(qc, patchMemberById(id, { color })),
      ),
  };
}
