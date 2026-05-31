"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkspaceBundle } from "@/lib/supabase/queries";
import { qk } from "@/lib/supabase/query-keys";
import type { Member, Category } from "@/lib/types";

export interface WorkspaceData {
  workspaceId: string;
  workspaceName: string;
  members: Member[];
  categories: Category[];
  currentMember: Member | null;
}

/** Load the workspace bundle and resolve which member the session belongs to. */
export function useWorkspace() {
  return useQuery<WorkspaceData>({
    queryKey: qk.workspace,
    queryFn: async () => {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      const bundle = await fetchWorkspaceBundle(sb);
      const currentMember =
        bundle.members.find((m) => m.authUserId === user?.id) ?? null;
      return {
        workspaceId: bundle.workspaceId,
        workspaceName: bundle.workspaceName,
        members: bundle.members,
        categories: bundle.categories,
        currentMember,
      };
    },
  });
}
