"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/supabase/query-keys";
import * as m from "@/lib/supabase/mutations";

/**
 * Sidebar write operations (categories + the signed-in member's own calendar)
 * wrapped with cache invalidation + toasts, mirroring useEventMutations.
 *
 * Everything invalidates the `qk.workspace` bundle — the same query backing the
 * members + categories lists (and from which event colors are derived
 * client-side), so a recolor/rename re-renders both the sidebar and the grid.
 */
export function useSidebarMutations() {
  const qc = useQueryClient();
  const sb = createClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.workspace });

  async function run<T>(p: Promise<T>, okMsg: string): Promise<boolean> {
    try {
      await p;
      await invalidate();
      toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    }
  }

  return {
    renameCategory: (id: string, name: string) =>
      run(m.updateCategory(sb, id, { name }), "Category renamed"),
    recolorCategory: (id: string, color: string) =>
      run(m.updateCategory(sb, id, { color }), "Category color updated"),
    deleteCategory: (id: string) =>
      run(m.deleteCategory(sb, id), "Category deleted"),

    renameMember: (id: string, name: string) =>
      run(m.updateMember(sb, id, { name }), "Calendar renamed"),
    recolorMember: (id: string, color: string) =>
      run(m.updateMember(sb, id, { color }), "Calendar color updated"),
  };
}
