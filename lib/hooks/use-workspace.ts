"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkspaceBundle } from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import type {
  Member,
  Category,
  Collection,
  Board,
  MemberSleepPrefs,
} from "@/lib/types";

export interface WorkspaceData {
  workspaceId: string;
  workspaceName: string;
  members: Member[];
  categories: Category[];
  collections: Collection[];
  boards: Board[];
  currentMember: Member | null;
  /** The current member's OWN sleep prefs (member-private); null = none yet. */
  sleepPrefs: MemberSleepPrefs | null;
}

/** Load the workspace bundle and resolve which member the session belongs to. */
export function useWorkspace() {
  return useQuery<WorkspaceData>({
    queryKey: qk.workspace,
    queryFn: async () => {
      const sb = createClient();
      // getClaims() reads the user id from the already-validated session cookie
      // (no Auth-server roundtrip); we only need it to match the current member.
      const { data: claims } = await sb.auth.getClaims();
      const userId = claims?.claims?.sub;
      const bundle = await fetchWorkspaceBundle(sb);
      const currentMember =
        bundle.members.find((m) => m.authUserId === userId) ?? null;
      return {
        workspaceId: bundle.workspaceId,
        workspaceName: bundle.workspaceName,
        members: bundle.members,
        categories: bundle.categories,
        collections: bundle.collections,
        boards: bundle.boards,
        currentMember,
        sleepPrefs: bundle.sleepPrefs,
      };
    },
    // The bundle (workspace name, members, categories) changes rarely and is
    // patched optimistically by member/category mutations, so keep it warm
    // across navigation instead of refetching on every remount. Explicit
    // invalidations still refetch regardless of this.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
